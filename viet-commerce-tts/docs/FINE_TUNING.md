# Chuẩn bị fine-tuning tiếng Việt

`node src/cli.mjs corpus-check --manifest C:/private/corpus.json --output C:/private/prepared` kiểm consent và tạo các split nếu corpus hợp lệ. `node src/cli.mjs gwen-prepare ...` xuất raw JSONL của Qwen/Gwen. Template trong examples cố ý không hợp lệ để tránh coi ví dụ là dữ liệu được phép train.

Consent cần id, speakerId, adult=true, revoked=false, storage=local-only, permittedUses gồm tts-training/commercial-synthesis, signedAt, evidence và evidenceSha256. Clip cần id, audio, text, sourceId, sessionId, textGroup, speakerId, consentId, sourceKind=human-recording, transcriptReviewed=true và cleanSpeechReviewed=true. Đường dẫn audio/evidence tương đối với manifest; các file này phải nằm ngoài Git.

Chỉ một người nói trong một lần train. Chọn accent vi-VN-northern/central/southern và gender female/male/unspecified dựa trên thông tin đã kiểm, không dựa tên file. Không lấy giọng mẫu có sẵn trong repo upstream hay bản synth đã được nghe duyệt làm dữ liệu người thật.

Hook cần nhấn rõ cụm trọng tâm và giữ khoảng nghỉ tự nhiên. Dùng [hook direction](HOOK_DIRECTION.md) làm sidecar biên tập/đánh giá; hiện chưa nối vào exporter. Chỉ âm thanh người thật có consent mới cung cấp mẫu acoustic để học nhấn, không phải tags hoặc script tổng hợp. Giữ transcript nguyên lời nói, tách các họ hook gần giống khỏi holdout khi xây corpus thực.

Sau raw export, workflow chính thức dùng `prepare_data.py` để tạo audio_codes bằng Qwen tokenizer, rồi `sft_12hz.py` để full-parameter SFT. Các script/model/tokenizer phải là snapshot local được pin và kiểm hash. Xem config/gwen.json và nguồn chính thức trong REFERENCES. Không truyền model ID làm lý do tự tải weights trong job nền.

Giai đoạn encoder, trainer launcher và held-out evaluation chưa được triển khai trong repo này. Raw preparation hoạt động và được test; nó luôn báo trainingReady=false. Không có corpus thực, môi trường CUDA hợp lệ hoặc model đã train ở lần khởi tạo. README upstream4GBVRAM là inference được thử, không phải minimum train đã xác minh. CPU inference là đường thử nghiệm riêng, không phải cam kết CPU training.

Để mở rộng: thêm environment lock, encoder local, runner có preflight và opt-in, held-out CER/WER cộng nghe dấu/tên/đơn vị/nhịp, rồi đánh giá ads-copy và rate trước khi activation. Không dùng lượt xem/đơn hàng làm chứng cứ giọng đọc đúng.
