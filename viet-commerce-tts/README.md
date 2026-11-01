# Viet Commerce TTS

Toolkit riêng cho **lời đọc tiếng Việt trong quảng cáo sản phẩm và ecommerce**: chuẩn bị script tự nhiên, truy xuất sự kiện có nguồn, lưu phản hồi phát âm/nhịp, adapter inference local và chuẩn bị corpus fine-tuning.

**Trạng thái0.1:** text/RAG/correction memory và dataset exporter có kiểm thử. Adapter Gwen đã viết với consent/hash/offline gates, chưa chạy bằng model thực. Chưa train hoặc kích hoạt voice mới. Không có dữ liệu khách hàng, weights hoặc giọng reference trong Git.

## Bắt đầu

Yêu cầu Node22+ và Python3.11+ cho các lệnh corpus. Không cần model để chạy test RAG/text. Dùng Python executable thật; Windows app alias có thể chưa phải runtime.

```powershell
npm ci
node src/cli.mjs help
node src/cli.mjs providers
node src/cli.mjs prepare-script C:/private/script.vi.txt
node src/cli.mjs hook-review examples/hook-direction.example.json
$env:VIET_TTS_PYTHON = 'C:/path/to/python.exe'
npm test
```

`VIET_TTS_HOME` là thư mục riêng ngoài checkout; mặc định `~/.local/share/viet-commerce-tts`. `.env.example` chỉ là hướng dẫn, CLI không tự đọc `.env`. Không cài dependency model hoặc tải weights chỉ để test bộ công cụ.

## RAG và sửa lời đọc

```powershell
node src/cli.mjs rag-build C:/private/verified-product-facts.json C:/private/index
node src/cli.mjs rag-query C:/private/index product-id evergreen 'Dung tích sản phẩm?'
node src/cli.mjs feedback-record C:/private/review-request.json
node src/cli.mjs feedback-query C:/private/correction-query.json
```

Product facts và voice feedback dùng corpus riêng. RAG hiện là lexical retrieval qua LangChain, trả prompt/dẫn nguồn; không có LLM sinh đáp án. Nguồn giá/ưu đãi thiếu hoặc hết hiệu lực phải abstain. Feedback gắn đúng audio/script/provider/model/profile; một rejection không phải lời đọc đúng. Lexicon chỉ sửa text đã được biên tập, không tự duyệt WAV. Prompt làm nội dung: [vietnamese-product-ad.md](prompts/vietnamese-product-ad.md).

## Audio và fine-tuning

```powershell
node src/cli.mjs tts --help
node src/cli.mjs corpus-check --manifest C:/private/corpus.json --output C:/private/corpus-prepared
node src/cli.mjs gwen-prepare --manifest C:/private/corpus.json --output C:/private/gwen-prepared
```

Inference cần local assets manifest đầy đủ, consented reference có bằng chứng, script/output ngoài Git và opt-in `--execute`. Cài dependency inference trong môi trường riêng khi chuẩn bị thử model; adapter sử dụng qwen_tts/PyTorch/soundfile, chưa có environment lock được đo trên máy đích. Không có cloud TTS hoặc auto-download path.

Fine-tuning hiện gồm kiểm corpus và raw JSONL export, chưa gồm encoder/trainer/evaluation runner. Chuẩn bị thành công không có nghĩa train thành công. Xem [hướng dẫn fine-tuning](docs/FINE_TUNING.md), [kiến trúc](docs/ARCHITECTURE.md) và [nguồn tham khảo](docs/REFERENCES.md).

[Hướng dẫn nhấn hook](docs/HOOK_DIRECTION.md) tách cụm trọng tâm, khoảng nghỉ và payoff khỏi transcript. Validator kiểm tính nhất quán; không tự điều khiển prosody, xác minh nguồn hoặc train voice. Dữ liệu biểu cảm người thật và nghe đánh giá vẫn cần trước fine-tuning.

Schemas và file contracts: [CONTRACTS.md](docs/CONTRACTS.md). Các template trong examples chưa có quyền hoặc dữ liệu được duyệt.

## Định hướng chất lượng

- Tiếng Việt tự nhiên, không ép slang; ưu tiên câu chuyện và nhu cầu thật của người mua.
- Không bịa công dụng, kết quả, testimonial, chứng nhận, giá hoặc khan hiếm.
- Tên thương hiệu/đơn vị cần nghe trên đúng WAV. Duyệt một preset không duyệt mọi bản thu.
- Generated → listening-reviewed → evaluated là các trạng thái khác nhau. Model weights chỉ thay đổi sau train thật; RAG không phải fine-tuning.
- Dùng cho reels và narrated slideshow; khả năng gắn WAV vào photo carousel phụ thuộc nền tảng đăng.

Code gốc trong bản public này được phát hành theo MIT. Chưa tích hợp đăng bài tự động; đây là workstream TTS độc lập để tiếp tục phát triển.
