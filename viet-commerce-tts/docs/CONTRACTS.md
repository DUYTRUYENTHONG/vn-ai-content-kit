# Contracts để mở rộng

## Sự kiện sản phẩm

Mỗi source có sourceId/productId/promotionKey/section/text/sourceUri/sourceHash, verified=true, verifiedAt và validFrom ISO có timezone; validTo nếu hết hiệu lực; claimFields mô tả volume/price/offer/material-check/certification... Nguồn phải được người vận hành kiểm tra trước khi đặt verified=true. Import không tự chứng nhận nhãn hoặc quyền dùng nội dung. Template verified=false cố ý bị từ chối. Nhiều sản phẩm phải dùng productId riêng. Với hàng không có chương trình, dùng promotionKey evergreen.

## Review request

`feedback-record` đọc JSON có receiptFile (absolute), account (project/store), productId, issue (pronunciation/pacing/emphasis/naturalness), targetText nằm trong script gốc, feedback, sourceRef và reviewedAt. Không ghi thông tin người mua hay toàn bộ tin nhắn riêng. File receipt do producer tạo phải có path WAV, scriptFile, script, sha256, scriptSha256, provider, voice, speed, modelManifestSha256 và runtimeConfigSha256. Các nguồn bất biến phải còn tồn tại để recheck.

`feedback-query` đọc JSON có receiptFile, account, productId, query; topK1–5 và maxAgeHours tối đa720 nếu cần. Không truyền phản hồi một voice/model vào voice/model khác như phán quyết phát âm. Đây là negative-review memory; accepted corrections là phần mở rộng tương lai, không phải tự gán approved=true vào record.

## Inference local

`tts` chỉ nhận model-dir/assets/reference/script/output bên ngoài Git. Assets JSON có modelId, revision đúng config/gwen.json và files=[{path,sha256}]. Mỗi file trong local snapshot phải có trong manifest, không cho symlink/path thoát model-dir. Manifest checksum không tự chứng minh nguồn tải; người vận hành phải kiểm nguồn snapshot.

Reference JSON cần speakerId, sourceKind=human-recording, adult=true, revoked=false, storage=local-only, permittedUses chứa commercial-synthesis, signedAt không tương lai, audio/audioSha256, text/transcriptReviewed=true, cleanSpeechReviewed=true, evidence/evidenceSha256. Reference phải là mono PCM16 dài3–15giây. Các file audio/evidence tương đối với reference JSON và đều ngoài Git. Consent phải thực sự có quyền phù hợp; fields/hash chỉ kiểm tính nhất quán của bản ghi.

Lệnh chỉ chạy khi có --execute. Không chứa speaker mặc định từ reference upstream. CPU là một tham số thử nghiệm, không phải benchmark đã đạt. Receipt mới luôn listeningVerified=false/publicationReady=false. Không thay giọng đang dùng trong ứng dụng khác.

## Phạm vi dữ liệu train

Corpus dùng cùng nguyên tắc consent nhưng yêu cầu tts-training lẫn commercial-synthesis. Validator trả raw split hashes và dataset fingerprint; exporter kiểm lại hash rồi chọn reference từ train. Không cho dùng validation/test làm reference. Test fixtures không phải speech corpus; exporter unit test không chứng minh waveform hay consent thật.
