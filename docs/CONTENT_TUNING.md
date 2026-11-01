# Content dataset preparation

Build a verified, product-scoped RAG index first. Then run:

```bash
node scripts/kit.mjs content-tuning-prepare /absolute/reviewed-examples.jsonl /absolute/index-directory
```

Every example needs id, groupId, sourcePostId, productId, promotionKey, instruction, response, sourceIds, consentForTraining=true, labelKind=editorial_approved and review with approved/reviewer/reviewedAt. These declarations require real human review and rights; generating them does not create evidence. The exporter refuses stale/expired/cross-product sources and apparent personal contact details, deduplicates related examples, and keeps story/source groups from crossing splits.

Readiness requires at least50 unique examples,10 independent groups and40/5/5 train/validation/heldout examples after splitting. Empty input returns ready=false; it never fabricates labels. The raw preparation includes lexical token checks, not model-token or conversion evaluation.

references/ contains the original exporter and a gated LoRA training/evaluation runner for future development. No model, training dataset, adapter or actual training run is included. Training would require a compatible locally pinned base snapshot, environment, genuinely approved dataset, explicit execution and held-out/editorial evaluation. Do not use synthetic audio as consented human voice-training positives.
