"""Local-only content LoRA preflight, training, and base-vs-adapter evaluation.

No packages/models are installed or downloaded by this entry point. Check is default;
training requires --execute and a validated ready manifest. Do not use the voice venv.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
CONFIG = {"rank": 8, "alpha": 16, "dropout": 0.1, "learning_rate": 0.0001,
          "epochs": 3, "batch_size": 1, "gradient_accumulation": 8,
          "warmup_ratio": 0.1, "weight_decay": 0.01, "max_length": 768,
          "max_new_tokens": 128, "seed": 42, "threads": 4}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def snapshot_hash(directory):
    files = sorted(set(directory.glob("*.safetensors")) | set(directory.glob("*token*.json"))
                   | set(directory.glob("chat_template*.jinja")) | {directory / "config.json"})
    if not any(p.suffix == ".safetensors" for p in files):
        raise ValueError("Expected local safetensors base weights")
    result = hashlib.sha256()
    for file in files:
        file_hash = hashlib.sha256()
        with file.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                file_hash.update(chunk)
        result.update(f"{file.name}:{file_hash.hexdigest()}\n".encode())
    return result.hexdigest()


def load_bundle(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf8"))
    data = {s: [json.loads(line) for line in (directory / f"{s}.jsonl").read_text(encoding="utf8").splitlines() if line.strip()]
            for s in ("train", "validation", "heldout")}
    if manifest.get("version") != 1 or manifest.get("datasetHash") != digest(data):
        raise ValueError("Dataset checksum/version mismatch; prepare again")
    if manifest.get("ready") is not True or manifest.get("blockers"):
        raise ValueError("Dataset not ready: " + "; ".join(manifest.get("blockers", [])))
    if len(data["train"]) < 40 or len(data["validation"]) < 5 or len(data["heldout"]) < 5:
        raise ValueError("Insufficient train/validation/heldout examples")
    seen = {k: set() for k in ("id", "groupId", "sourcePostId")}
    previous_responses = set()
    for split, rows in data.items():
        for key in seen:
            values = {r[key] for r in rows}
            if values & seen[key]:
                raise ValueError(f"{key} leakage into {split}")
            seen[key].update(values)
        responses = set()
        for row in rows:
            if row.get("consentForTraining") is not True or row.get("labelKind") != "editorial_approved" or row.get("review", {}).get("approved") is not True:
                raise ValueError("Missing consent or approval")
            if [m["role"] for m in row["messages"]] != ["system", "user", "assistant"]:
                raise ValueError("Expected system/user/assistant messages")
            responses.add(re.sub(r"\W+", " ", row["messages"][-1]["content"].casefold()))
        if responses & previous_responses:
            raise ValueError("Duplicate response leakage")
        previous_responses.update(responses)
    return manifest, data


def rouge_l(prediction, reference):
    a, b = prediction.casefold().split(), reference.casefold().split()
    prior = [0] * (len(b) + 1)
    for word in a:
        current = [0]
        for j, other in enumerate(b):
            current.append(prior[j] + 1 if word == other else max(prior[j + 1], current[-1]))
        prior = current
    return 2 * prior[-1] / (len(a) + len(b)) if a or b else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["check", "train", "evaluate"], nargs="?", default="check")
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--base-model", type=Path, help="Local Qwen2.5-0.5B-Instruct snapshot; no automatic download")
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    manifest, data = load_bundle(args.dataset)
    missing = [name for name in ("torch", "transformers", "peft", "accelerate") if importlib.util.find_spec(name) is None]
    preflight = {"readyDataset": True, "datasetHash": manifest["datasetHash"], "counts": {s: len(r) for s, r in data.items()},
                 "missingPackages": missing, "config": CONFIG, "trained": False,
                 "environment": "CPU float32; no CUDA/QLoRA assumptions"}
    if args.mode == "check":
        print(json.dumps(preflight, ensure_ascii=False, indent=2))
        return
    if not args.execute:
        raise ValueError("--execute required to run local model work; check never trains")
    if missing:
        raise ValueError("Use a separate content-training environment. Missing: " + ", ".join(missing))
    if not args.base_model or not args.base_model.is_absolute() or not args.base_model.is_dir():
        raise ValueError("An absolute local base-model snapshot is required")
    if not args.output or not args.output.is_absolute() or args.output.exists():
        raise ValueError("Pass a new absolute output directory to preserve existing runs")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, EarlyStoppingCallback, set_seed
    from peft import LoraConfig, TaskType, get_peft_model, PeftModel
    torch.set_num_threads(CONFIG["threads"])
    set_seed(CONFIG["seed"])
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, local_files_only=True, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(args.base_model, local_files_only=True, trust_remote_code=False,
                                               torch_dtype=torch.float32).to("cpu")
    if model.config.model_type != "qwen2" or model.num_parameters() > 600_000_000:
        raise ValueError("This bounded CPU configuration supports only Qwen2.5-0.5B-Instruct")
    config_hash = hashlib.sha256((args.base_model / "config.json").read_bytes()).hexdigest()
    base_snapshot_hash = snapshot_hash(args.base_model)

    def encode(row):
        ids = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=False)
        prefix = tokenizer.apply_chat_template(row["messages"][:-1], tokenize=True, add_generation_prompt=True)
        if ids[:len(prefix)] != prefix or len(ids) <= len(prefix):
            raise ValueError("Chat template response boundary mismatch")
        if len(ids) > CONFIG["max_length"]:
            raise ValueError(f"Example {row['id']} exceeds actual model-token budget; do not truncate source/answer")
        return {"input_ids": ids, "attention_mask": [1] * len(ids), "labels": [-100] * len(prefix) + ids[len(prefix):]}

    encoded = {s: [encode(r) for r in rows] for s, rows in data.items()}
    model_lengths = [len(r["input_ids"]) for rows in encoded.values() for r in rows]
    token_histogram = {"under128": sum(n < 128 for n in model_lengths),
                       "from128to511": sum(128 <= n < 512 for n in model_lengths),
                       "from512": sum(n >= 512 for n in model_lengths), "maximum": max(model_lengths)}

    def collate(rows):
        size = max(len(r["input_ids"]) for r in rows)
        return {key: torch.tensor([r[key] + [pad] * (size - len(r[key])) for r in rows])
                for key, pad in (("input_ids", tokenizer.pad_token_id), ("attention_mask", 0), ("labels", -100))}

    args.output.mkdir(parents=True)
    training_args = TrainingArguments(output_dir=str(args.output / "checkpoints"), use_cpu=True,
        num_train_epochs=CONFIG["epochs"], per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=CONFIG["gradient_accumulation"], learning_rate=CONFIG["learning_rate"],
        warmup_ratio=CONFIG["warmup_ratio"], weight_decay=CONFIG["weight_decay"], lr_scheduler_type="cosine",
        eval_strategy="epoch", save_strategy="epoch", save_total_limit=2, load_best_model_at_end=True,
        metric_for_best_model="eval_loss", greater_is_better=False, logging_steps=1, report_to="none",
        fp16=False, bf16=False, dataloader_pin_memory=False, seed=CONFIG["seed"])
    if args.mode == "train":
        # Validation guides early stopping. The held-out test set is never passed to the trainer.
        trainer = Trainer(model=model, args=training_args, train_dataset=encoded["train"],
                          eval_dataset=encoded["validation"], data_collator=collate, processing_class=tokenizer)
        baseline_validation = trainer.evaluate()["eval_loss"]
        model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, r=CONFIG["rank"],
            lora_alpha=CONFIG["alpha"], lora_dropout=CONFIG["dropout"], target_modules=["q_proj", "v_proj"], bias="none"))
        trainer = Trainer(model=model, args=training_args, train_dataset=encoded["train"], eval_dataset=encoded["validation"],
                          data_collator=collate, processing_class=tokenizer,
                          callbacks=[EarlyStoppingCallback(early_stopping_patience=1)])
        trainer.train()
        final_validation = trainer.evaluate()["eval_loss"]
        model.save_pretrained(args.output / "adapter")
        tokenizer.save_pretrained(args.output / "adapter")
        report = {**preflight, "trained": True, "modelTokenHistogram": token_histogram, "baseConfigHash": config_hash, "baseSnapshotHash": base_snapshot_hash,
                  "baseModel": str(args.base_model), "baseValidationLoss": baseline_validation,
                  "adapterValidationLoss": final_validation, "validationImproved": final_validation < baseline_validation,
                  "deployReady": False, "next": "Run evaluate against heldout, then human factual/style review"}
    else:
        if not args.adapter or not (args.adapter / "adapter_config.json").is_file():
            raise ValueError("A real trained adapter is required for evaluation")
        provenance = json.loads((args.adapter.parent / "report.json").read_text(encoding="utf8"))
        if provenance.get("trained") is not True or provenance.get("baseSnapshotHash") != base_snapshot_hash or provenance.get("datasetHash") != manifest["datasetHash"]:
            raise ValueError("Adapter provenance does not match the exact base weights and dataset")
        if not (args.adapter / "adapter_model.safetensors").is_file():
            raise ValueError("Adapter weights are missing")

        def benchmark(current):
            current.eval()
            trainer = Trainer(model=current, args=training_args, data_collator=collate, processing_class=tokenizer)
            loss = trainer.evaluate(encoded["heldout"])["eval_loss"]
            rows = []
            for row in data["heldout"]:
                inputs = tokenizer.apply_chat_template(row["messages"][:-1], tokenize=True, add_generation_prompt=True,
                                                        return_tensors="pt").to("cpu")
                start = time.perf_counter()
                with torch.inference_mode():
                    result = current.generate(inputs, attention_mask=torch.ones_like(inputs), do_sample=False,
                        max_new_tokens=CONFIG["max_new_tokens"], pad_token_id=tokenizer.pad_token_id)
                elapsed = time.perf_counter() - start
                text = tokenizer.decode(result[0, inputs.shape[-1]:], skip_special_tokens=True)
                rows.append({"id": row["id"], "text": text, "latencySeconds": elapsed,
                             "rougeL": rouge_l(text, row["messages"][-1]["content"]),
                             "first50CustomersError": bool(re.search(r"(?:50|năm\s+mươi)\s*khách", text, re.I))})
            return {"loss": loss, "perplexity": math.exp(min(loss, 80)), "rougeL": sum(r["rougeL"] for r in rows) / len(rows),
                    "meanLatencySeconds": sum(r["latencySeconds"] for r in rows) / len(rows), "examples": rows}

        baseline = benchmark(model)
        adapted = benchmark(PeftModel.from_pretrained(model, args.adapter, local_files_only=True))
        report = {"datasetHash": manifest["datasetHash"], "modelTokenHistogram": token_histogram, "baseConfigHash": config_hash, "baseSnapshotHash": base_snapshot_hash, "base": baseline, "adapter": adapted,
                  "deployReady": False, "note": "ROUGE/perplexity do not verify truth, attribution, Vietnamese fluency or conversion. Human review and real post outcomes remain required."}
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, FileNotFoundError, KeyError) as error:
        raise SystemExit(str(error)) from error
