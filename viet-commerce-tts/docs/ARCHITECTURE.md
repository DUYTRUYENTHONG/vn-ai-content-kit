# Kiến trúc

Mục tiêu: công cụ TTS tiếng Việt cho quảng cáo sản phẩm, reels và video slideshow ecommerce. Không chứa uploader TikTok, chatbot khách hàng hoặc hệ thống tự gửi tin nhắn.

1. `src/editorial.mjs`: chuẩn hóa Unicode/khoảng trắng, giữ ngắt đoạn/dấu hỏi, tách chữ hiển thị và lời đọc. Lexicon có nguồn và trạng thái duyệt riêng; không tự suy ra phát âm đúng.
2. `src/knowledge/index.mjs`: index nguồn sản phẩm riêng, truy xuất lexical/BM25 qua LangChain thật, tạo prompt có dẫn nguồn, từ chối thông tin giá/ưu đãi chưa biết. Không gắn LLM hoặc gọi cloud. Chưa xác lập benchmark độc lập về chất lượng truy xuất.
3. `src/knowledge/voice-corrections.mjs`: corpus phản hồi âm thanh riêng. Hash WAV/script/receipt; lọc project, sản phẩm, provider, preset, tốc độ, model và config. Rejection không phải phát âm đúng hay dữ liệu train. Các ngữ cảnh không đúng profile phải abstain.
4. `scripts/synthesize-gwen.py`: adapter local opt-in. Cần snapshot đầy đủ đã kiểm hash, reference người trưởng thành có bằng chứng cho phép commercial synthesis, transcript được kiểm tra và output ngoài Git. Sockets/HF network bị tắt; import model chỉ sau các gate. Adapter chưa được thử bằng trọng số thực tại lần khởi tạo repo.
5. `scripts/prepare-corpus.py`: kiểm corpus người thật, consent, transcript, waveform PCM16 mono48kHz3–15s, chống trùng, tách nhóm session/source/text để tránh rò rỉ holdout. Mặc định100clip/600giây là policy ban đầu của kit, không phải minimum chung cho mọi model.
6. `scripts/prepare-gwen-training.py`: xuất raw JSONL theo workflow Qwen single-speaker; reference lấy từ train, giữ riêng validation/test, kiểm lại hash. Chưa mã hóa tokenizer hoặc chạy SFT. Không dùng lại adapter VieNeu.

Dữ liệu riêng mặc định: `VIET_TTS_HOME`, ngoài checkout. Mọi bản thu mới vẫn cần nghe về dấu, tên sản phẩm, nhịp, âm cuối, chuyển câu và độ cân nhạc. Trước khi dùng cho quảng cáo phải kiểm điều kiện ưu đãi và thông tin sản phẩm hiện tại. `publicationReady:false` là mặc định của các producer.

Trạng thái phân biệt: text prepared → WAV generated → listening reviewed → evaluation accepted. Dataset prepared → encoded → training completed → held-out evaluated → model activated là chuỗi khác. Không bước nào tự suy ra bước tiếp theo.

Mở rộng tiếp: normalizer từng provider; correction đã được chấp nhận với phạm vi chính xác; evaluation tiếng Việt tách khỏi training; encoder/trainer Qwen local có pin/hash; API/job queue nếu thật sự cần. Giữ read-only RAG tách khỏi quyền sinh âm thanh và train.
