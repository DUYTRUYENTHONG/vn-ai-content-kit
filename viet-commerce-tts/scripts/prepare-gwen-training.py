"""Prepare source-verified human-speech JSONL for Qwen/Gwen. Never loads models or trains."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('commerce_corpus', ROOT/'scripts/prepare-corpus.py')
corpus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(corpus)
CONFIG_FILE = ROOT/'config/gwen.json'
CONFIG = json.loads(CONFIG_FILE.read_text(encoding='utf-8'))


def export_prepared(ready, output):
    if ready.get('dataReady') is not True:
        raise ValueError('A freshly validated consented human corpus is required')
    dataset = corpus.private_path(Path(ready['datasetDirectory']))
    output = corpus.private_path(Path(output))
    rows = {}
    seen = set()
    speakers = set()
    for split in ('train', 'validation', 'test'):
        file = dataset/(split+'.jsonl')
        if corpus.sha(file) != ready['rawSplitHashes'].get(split):
            raise ValueError('Prepared split changed: '+split)
        rows[split] = [json.loads(line) for line in file.read_text(encoding='utf-8').splitlines() if line.strip()]
        if not rows[split]:
            raise ValueError('Each held-out split must remain nonempty')
        for row in rows[split]:
            audio = corpus.private_path(Path(row['audio']))
            if (row.get('sourceKind') != 'human-recording' or not row.get('consentId')
                    or row.get('transcriptReviewed') is not True or row.get('cleanSpeechReviewed') is not True
                    or corpus.sha(audio) != row.get('audioSha256')):
                raise ValueError('Unreviewed/synthetic/unbound training row')
            if row['audioSha256'] in seen:
                raise ValueError('Duplicate audio or split leakage')
            seen.add(row['audioSha256'])
            speakers.add(row['speakerId'])
    if len(speakers) != 1:
        raise ValueError('The reviewed upstream trainer supports one speaker')
    # The shared reference comes only from train, never from held-out audio.
    reference = rows['train'][0]['audio']
    fingerprint = hashlib.sha256(json.dumps(dict(dataset=ready['datasetSha256'],
        config=corpus.sha(CONFIG_FILE), splits=ready['rawSplitHashes']), sort_keys=True).encode()).hexdigest()
    target = output/fingerprint
    target.mkdir(parents=True, exist_ok=True)
    files = {}
    for split, items in rows.items():
        content = ''.join(json.dumps(dict(audio=r['audio'], text=r['text'], ref_audio=reference), ensure_ascii=False)+'\n' for r in items)
        destination = target/(split+'_raw.jsonl')
        if destination.exists() and destination.read_text(encoding='utf-8') != content:
            raise ValueError('Existing export changed; preserve the original version')
        destination.write_text(content, encoding='utf-8')
        files[split] = dict(path=str(destination), sha256=corpus.sha(destination), rows=len(items))
    report = dict(datasetExported=True, trainingReady=False, trainingExecuted=False,
        configSha256=corpus.sha(CONFIG_FILE), datasetSha256=ready['datasetSha256'],
        exportFingerprint=fingerprint, files=files, referenceSourceSplit='train',
        referenceAudioSha256=rows['train'][0]['audioSha256'], model=CONFIG['model'],
        modelRevision=CONFIG['modelRevision'], trainingSourceRevision=CONFIG['trainingSourceRevision'],
        blockers=['Reviewed local model/tokenizer snapshots and dependencies missing',
                  'Gwen checkpoint compatibility with upstream SFT not smoke-tested',
                  'Hardware/environment and held-out evaluation remain required'])
    (target/'export-receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=corpus.HOME/'training/corpus.json')
    parser.add_argument('--output', type=Path, default=corpus.HOME/'gwen/prepared')
    args = parser.parse_args()
    output = corpus.private_path(args.output)
    ready = corpus.validate(args.manifest, output/'corpus-preflight')
    result = (export_prepared(ready, output) if ready.get('dataReady') else
              dict(datasetExported=False, trainingReady=False, trainingExecuted=False,
                   blockers=ready.get('errors', [])+['Gwen/Qwen training environment, local model assets and checkpoint compatibility remain unverified'],
                   inheritedCorpusHardwareProbe=ready.get('hardware'),
                   hardwareProbeScope='Existing corpus-tool probe only; not a measured Gwen training VRAM minimum', config=CONFIG))
    output.mkdir(parents=True, exist_ok=True)
    (output/'readiness.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['datasetExported'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
