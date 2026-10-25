# Trạng thái bản đầu — 25/10/2026

## Đã có mã và chạy kiểm thử

- Một website, giao diện người học và khu quản trị theo vai trò.
- Google OAuth qua Supabase; chờ duyệt, danh sách email được phép, khóa thành viên; RLS bảo vệ dữ liệu và bucket riêng.
- Trắc nghiệm có số lựa chọn linh hoạt, chọn một/chọn nhiều, lời giải, ghi nhớ, song ngữ nếu có dữ liệu, lưu câu, báo lỗi; kết quả lần đầu tách với làm lại.
- Flashcard có hình minh họa, lật đáp án, bốn mức nhớ và lịch ôn riêng; phiên ôn hữu hạn.
- Chọn nhiều ảnh, OCR Việt–Anh trong trình duyệt, hàng đợi, sửa bản chép, giữ OCR thô, xoay/cắt, tách câu nháp và ghép ý kiến nguồn.
- Duyệt câu và bộ học, xuất/nhập nội dung JSON; gói 125 câu được chuyển từ HTML và giữ riêng ngoài mã công khai.
- Kiểm tra AI từng câu hoặc hàng đợi tối đa 25 câu theo bộ lọc; Gemini hoặc DeepSeek, một model mỗi lần, hai lượt cùng model; đánh giá riêng đáp án/lời giải; không tự sửa đáp án đã duyệt.
- Mã nguồn Edge Function, migration SQL và workflow GitHub Pages; API key đặt ở Supabase Secrets.

## Đã kiểm tra

40 kiểm thử tự động qua, gồm 11 kiểm thử quy tắc dữ liệu/RLS trên PostgreSQL trong PGlite, 11 kiểm thử logic AI, bốn kiểm thử thao tác người học và các kiểm thử tách câu/chấm/lịch ôn/import. TypeScript frontend/Edge Function và build Vite qua. Ảnh OCR thử tự soạn được đọc bằng Tesseract.js Việt–Anh và dữ liệu ngôn ngữ đã cài; kết quả còn sai dấu ở vài chữ.

## Chưa có kết nối thực tế

- Chưa tạo/đưa mã lên repository GitHub của người dùng.
- Chưa cấu hình một dự án Supabase thật; chưa chạy Google OAuth và lưu ảnh online đầu cuối.
- Chưa gán API key hoặc gọi AI thật. Các kiểm thử AI dùng phản hồi giả lập để kiểm tra quy tắc xử lý, không khẳng định chất lượng giải bài của một model.
- Chưa kiểm tra trực quan/trình duyệt thật vì công cụ trình duyệt bị tắt trong Work; các kiểm thử giao diện dùng DOM kiểm thử.
- Chưa đo OCR trên bộ ảnh chụp thực tế hoặc tải 50–200 người đồng thời.

## Cách tiếp tục sử dụng

Mở `Mo_Cung_Hoc.cmd`, truy cập `http://127.0.0.1:5178/`, chọn **Khám phá bản mẫu**. Bản mẫu chỉ lưu trên thiết bị và không giả lập việc đăng nhập/gọi AI thành công. Làm theo README và `docs/BACKEND.md` để kết nối Supabase và GitHub Pages. Dữ liệu đang nhập trong bản mẫu cần xuất JSON và giữ ảnh gốc trước khi chuyển sang cloud.
