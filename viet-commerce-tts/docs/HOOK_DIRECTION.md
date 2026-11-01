# Nhấn giọng ở câu mở đầu

Quy tắc biên tập: hook cần chạm đúng một băn khoăn cụ thể của người mua, có một cụm trọng tâm để nhấn và cho người xem lý do nghe tiếp. Phần thân phải trả lời điều hook gợi ra trước CTA. Không dùng cùng một công thức cho mọi sản phẩm hoặc thêm ưu đãi chưa được xác minh.

Quy trình kiểm tra nhất quán, câu chữ vẫn cần sáng tạo: viết ba hook khác cơ chế; chọn một theo bối cảnh và payoff; lưu focusPhrase, pauseAfterPhrase và direction riêng khỏi lời đọc. Ưu tiên nhấn nghĩa và khoảng nghỉ tự nhiên, không hét, không viết HOA cả câu hoặc ép nhanh hơn. Nhãn cơ chế là mô tả biên tập, chưa có bằng chứng thắng về impression hay doanh số.

```powershell
node src/cli.mjs hook-review examples/hook-direction.example.json
```

Lệnh kiểm hook là đầu script, cụm nhấn/nghỉ khớp duy nhất, payoff có trong phần thân và hash script không cũ. Nó không xác minh ý nghĩa, nguồn sự kiện, chất lượng hook, thời điểm ngắt hay giọng đã nhấn đúng. Script trả ra giữ nguyên nội dung, không chèn SSML/tags hoặc lệnh cảm xúc. Kiểm normalizer thật và nghe WAV thực; provider có thể bỏ qua chỉ dẫn nhấn. VieNeu hiện dùng trong kit Sakura bỏ qua tham số style.

## Chuẩn bị dữ liệu fine-tuning

Lưu direction như sidecar biên tập gắn scriptSha256. Sau khi có bản thu người thật được consent và review, có thể gắn clipId/audioSha256, người nghe, thời điểm và nhận xét nhấn/nghỉ. Sidecar hiện chưa được nối vào exporter/trainer; không có trường prosody được đưa tự động vào Gwen. Qwen/Gwen raw contract vẫn là audio/text/ref_audio; không nhét chỉ dẫn sân khấu vào transcript.

Muốn học nhấn giọng phải có âm thanh người thật thể hiện đúng ý định, transcript và consent hợp lệ; metadata đơn lẻ không dạy được cách nhấn. WAV tổng hợp đã duyệt chỉ là mẫu đánh giá, không phải dữ liệu người thật. Chưa có corpus nên chưa train.

Khi mở rộng, tách holdout theo session/source/textGroup và nhóm họ hook/campaign trước khi chia train/validation/test; đừng để biến thể gần giống của một hook vào hai split. Chia nhóm họ hook chưa được validator hiện tại tự thực hiện. Đánh giá dấu, phát âm, focus, khoảng nghỉ, tự nhiên trên đúng audio và người nghe tiếng Việt, so sánh cùng script/tốc độ với model gốc. Kiểm thử quảng cáo và attribution là phép đo riêng, không suy từ CER/WER hoặc lượt thích.
