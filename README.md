# VN AI Content Kit

Vietnamese product-ad copy, source-grounded RAG, voice correction memory and offline narration previews. Includes a local MCP plugin, reusable skills, and content/voice fine-tuning preparation tools.

**MIT licensed. No trained weights, voice recordings, private campaign data or API keys are included.** RAG builds evidence context; it has no attached answer-generation LLM. Fine-tuning preparation does not mean a model has been trained.

## Quick start

Requires Node22+. Text/RAG works without a voice model or API key.

```bash
git clone https://github.com/DUYTRUYENTHONG/vn-ai-content-kit.git
cd vn-ai-content-kit
npm ci
node scripts/kit.mjs help
node scripts/kit.mjs prepare-script /absolute/path/to/script.vi.txt
npm test
```

Use [the Vietnamese master prompt](prompts/MASTER_PROMPT.vi.md) in your coding assistant to research facts, propose distinct angles, write natural scripts and carousel stories, and review outputs. Bring your own verified product facts and brand brief. Do not inherit example promotions or claim a proven winning angle from an untested idea.

## RAG and correction memory

```bash
node scripts/kit.mjs rag-build /absolute/verified-facts.json ./data/rag
node scripts/kit.mjs rag-query ./data/rag product-id evergreen 'Thông tin nào đã được xác minh?'
node scripts/kit.mjs hook-review ./viet-commerce-tts/examples/hook-direction.example.json
```

The [facts template](viet-commerce-tts/examples/product-facts.template.json) is intentionally unverified and must not pass indexing unchanged. Keep product facts and voice feedback separate. Feedback is bound to the exact audio/script/provider/model/profile and is not an approved correction. See [contracts](viet-commerce-tts/docs/CONTRACTS.md).

## Local Vietnamese voice

```bash
node scripts/kit.mjs status
# Configure runtime-link.local.json first; see docs/LOCAL_VOICE.md
node scripts/kit.mjs voice-render /absolute/path/to/script.vi.txt
```

The VieNeu preview launcher uses separately installed, hash-verified local assets, blocks network access during synthesis and writes WAV/receipts into outputs/voice/. It does not download models or clone voices. The original workstation rendered a5.7-second technical smoke preview; this is not a guarantee of naturalness, pronunciation or speed on another machine. Every new narration needs listening review.

## MCP plugin

The repository root is the local plugin package. Add it using your host's supported local-plugin flow; copying/cloning does not install it. The built stdio entrypoint is `dist/content-mcp.mjs`; `mcp.json`, `.mcp.json` and `.codex-plugin/plugin.json` provide manifests. Tools: `kit_status`, `prepare_script`, `render_voice`, `rag_build`, `rag_query`, `hook_review`, `feedback_context`.

After editing src/content-mcp.mjs, run `npm run build:plugin`. The plugin creates local previews/context; it does not publish social posts or approve audio.

## Fine-tuning

- Voice: consent-checked corpus splitting and raw Gwen/Qwen export. No encoder/trainer or trained voice is shipped. [Voice preparation](viet-commerce-tts/docs/FINE_TUNING.md).
- Content: source-bound, human-approved example validation, deduplication and held-out splits. Requires at least50 distinct approved examples and sufficient independent groups. A future training runner is included under references/ as reference source, not automatically executed. [Content preparation](docs/CONTENT_TUNING.md).

No paid cloud generation, automatic weights download, customer impersonation, account automation or publishing is included. Confirm the separate licenses and consent covering any models, presets, datasets, footage and music you add. V-TTS's reviewed noncommercial restrictions are not overridden by this repository's MIT license. Dependency notices are preserved under dist/licenses/.

## Tiếng Việt

Dùng bộ này để làm hook/story, sửa lời Việt, truy xuất facts và tạo bản nghe thử. Chưa có model nội dung hoặc giọng đã fine-tune. Bản thu mới phải nghe duyệt; không bịa giá, ưu đãi, kết quả hoặc lời chứng thực. Điền thông tin sản phẩm có nguồn trước khi sinh quảng cáo. Model/voice assets cài riêng và giữ ngoài Git.
