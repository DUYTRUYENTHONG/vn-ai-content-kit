# Nguồn tham khảo và quyết định

Kiểm tra31/10/2026. Repo mới chỉ chứa code gốc của kit và phần đã được port từ công cụ cùng chủ sở hữu; không chứa code/model/giọng mẫu của các repo TTS tham khảo.

| Nguồn | Pin/giấy phép quan sát | Ứng dụng |
| --- | --- | --- |
| [Gwen-TTS](https://github.com/ggroup-ai-lab/gwen-tts/tree/f0f24d8636596dc635323e02f41bee42bb64385e) | MIT trong metadata; model card MIT | API inference tham khảo, config model được pin; giọng reference đi kèm không phải consent cho kit |
| [Gwen model](https://huggingface.co/g-group-ai-lab/gwen-tts-0.6B) | revision `a83e1f08656d48217a83f0ad422d1610d5b5c963` | Chưa tải weights hoặc đánh giá chất lượng trên máy này |
| [Qwen3-TTS fine-tuning](https://github.com/QwenLM/Qwen3-TTS/tree/022e286b98fbec7e1e916cb940cdf532cd9f488e/finetuning) | Apache2.0 header; single-speaker full SFT | Contract `audio/text/ref_audio`, tokenizer audio_codes rồi train; không phải VieNeu LoRA |
| [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) | SDK3.8.3, source `04044e1b8f822f946bafb2c88b716459f4164152` trong kit trước | Bài học preset, speech normalizer, hash và nghe duyệt; adapter mới chưa được port vào repo này |
| [V-TTS](https://github.com/tronghieuit/v-tts/tree/e22eef3267869375e40a096b376cde94aa41e610) | CC BY-NC4.0 | Chỉ review; không tích hợp cho commercial generation khi chưa có quyền bằng văn bản |
| Kit nguồn cùng chủ sở hữu | `tiktok-autoposting`, commits `4b1349b`, `89c5383` | Port validator, RAG và exporter do chúng ta viết; không sao chép ledger, consent, WAV hay campaign state |

Mô tả “tự nhiên”, performance và dataset trên README upstream là tuyên bố tác giả, không phải kết quả kiểm thử của repo mới. Một license model không tự xác minh quyền bắt chước giọng người thật. Fine-tuning và đổi active model chưa được thực hiện. Các dependency npm giữ license qua package manager; source gốc trong bản public này dùng MIT.
