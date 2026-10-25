# Cùng học

Web trắc nghiệm và flashcard cho nhóm, giao diện dựa trên HTML FPGA được cung cấp. Một website có khu vực học và khu vực quản trị, chạy trên GitHub Pages, dùng Supabase cho tài khoản/dữ liệu/ảnh riêng và gọi AI.

## Chạy trên máy

Yêu cầu Node.js 22 trở lên.

```powershell
npm install
npm run dev
```

Mở địa chỉ Local mà Vite in ra, mặc định `http://127.0.0.1:5178`.

Trên máy Windows này đã có thư viện, có thể nhấp đúp `Mo_Cung_Hoc.cmd` rồi mở địa chỉ trên. Giữ cửa sổ máy chủ mở trong lúc sử dụng.

Khi chưa có cấu hình Supabase, trang đăng nhập có nút **Khám phá bản mẫu**. Bản này có năm câu tự soạn công khai để thử các thao tác. Dữ liệu và ảnh bạn nhập được lưu bằng IndexedDB trên trình duyệt; đây không phải đăng nhập thật hoặc đồng bộ nhiều người. Không gửi lời mời thật hay giả lập kết quả AI thành công. Xóa dữ liệu trình duyệt sẽ mất bản mẫu; xuất bản sao lưu trước khi cần chuyển thiết bị.

Khi đã cấu hình Supabase, bản triển khai dùng Google và quyền thành viên từ cơ sở dữ liệu; không mở đường đăng nhập quản trị mẫu.

```powershell
npm test
npm run build
```

## Kết nối Supabase và Google

1. Tạo một dự án Supabase do bạn sở hữu. Xem [hướng dẫn backend](docs/BACKEND.md) để chạy migration, tạo bucket riêng, cấp tài khoản quản trị và triển khai Edge Function.
2. Sao chép `.env.example` thành `.env.local`; điền URL dự án và **publishable/anon key** của Supabase. Đây là cấu hình công khai được bảo vệ bằng RLS, không phải service-role key.
3. Bật nhà cung cấp Google trong Supabase Auth. Trong Google Cloud, khai báo callback do Supabase cung cấp, dạng `https://<project-ref>.supabase.co/auth/v1/callback`. Chỉ yêu cầu thông tin nhận dạng cơ bản.
4. Trong Supabase Auth > URL Configuration, thêm `http://127.0.0.1:5178/` và địa chỉ GitHub Pages chính xác, có tên repository và dấu `/` cuối nếu dùng project site. Mã dùng PKCE và callback trở lại trang gốc trước khi đọc hash điều hướng.
5. Đăng nhập bằng tài khoản của bạn rồi cấp `role=admin,status=active` bằng SQL theo hướng dẫn backend. Không có email quản trị hoặc mật khẩu quản trị mặc định trong mã. Không cho phép người dùng tự sửa vai trò.
6. Tài khoản mới mặc định chờ duyệt. Trong **Thành viên**, thêm email được phép hoặc duyệt người đã đăng nhập. Khóa tài khoản chặn yêu cầu dữ liệu tiếp theo qua RLS, kể cả phiên đăng nhập chưa hết hạn.

Thành viên được thông báo chủ nhóm có thể xem email, hoạt động và tiến độ học. Không xem được email/lịch sử học của thành viên khác.

## Nhập bộ 125 câu từ HTML

Bộ câu hỏi gốc **không nằm trong mã giao diện hay thư mục dist**. Tệp riêng trong `private-data/` được `.gitignore` loại trừ.

```powershell
npm run import:html -- "C:\duong-dan\bo-cau-hoi.html"
```

Sau đó vào **Bộ câu hỏi → Nhập JSON**, chọn `private-data/fpga-review-pt2.json`. Bộ được nhập ở trạng thái nháp. Ba câu mang nhãn đáp án dự kiến cần kiểm tra lại; nhãn cảnh báo được giữ. Có thể duyệt và xuất bản các câu đủ dữ liệu. Công cụ chỉ đọc JSON nhúng `question-bank`, không chạy JavaScript trong HTML. Hỗ trợ giữ câu Việt–Anh, lời giải và mẹo ghi nhớ.

## Nhập ảnh, OCR và duyệt

Vào **Nhập tài liệu**, tạo/chọn bộ học và thêm ảnh JPG/JPEG/PNG (có thể WebP theo trình duyệt). Phân biệt ảnh đề và ảnh bình luận/đáp án. Tesseract.js chạy trong trình duyệt với `eng+vie`, lần đầu cần tải mã và dữ liệu ngôn ngữ. Hàng đợi dùng một worker tái sử dụng, lưu kết quả từng ảnh. Có thể dừng các mục chưa chạy, thử lại ảnh lỗi và sửa bản chữ sau OCR; luôn giữ OCR thô và ảnh nguồn.

Tách câu có số lựa chọn linh hoạt; không mặc định bốn lựa chọn hay đáp án A. Khi ảnh bị chia trang, kiểm tra và ghép/sửa bằng màn soạn. Xác nhận câu chọn một/chọn nhiều, đáp án đúng, lời giải và các phần hình cần thiết trước khi duyệt. Câu chọn nhiều được chấm đúng khi chọn đủ và không chọn thừa. Bình luận là ý kiến nguồn, không phải khóa đáp án chính thức.

Đóng tab sẽ dừng OCR đang chạy và các việc chưa gửi. Bản nháp đã lưu vẫn còn; tiếp tục bằng hàng đợi còn lại khi mở lại. Khi dùng cloud, cần lưu ảnh và bản nháp thành công để chuyển máy. 20–100 ảnh được xử lý lần lượt; thời gian và độ chính xác phụ thuộc ảnh và máy, chưa có cam kết thời gian cố định.

## Kiểm tra đáp án bằng AI

Trong Supabase Dashboard > Edge Functions > Secrets, bạn tự gán:

- `GEMINI_API_KEY`, `GEMINI_MODEL` nếu dùng Gemini.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` nếu dùng DeepSeek.
- `ALLOWED_ORIGINS`: các origin giao diện được phép gọi (không gồm đường dẫn repository), theo hướng dẫn backend.

Không đưa các key AI/service-role vào biến `VITE_*`, GitHub Pages, localStorage, ảnh chụp hoặc chat. Giao diện chỉ báo đã cấu hình/chưa cấu hình.

Mỗi lần kiểm tra chỉ dùng **một provider/model bạn chọn**. Có hai lượt gọi cùng model: giải từ đề trước, rồi đối chiếu từng ý kiến. Không gọi model thứ hai và không tự chuyển nhà cung cấp khi lỗi. Kết quả gắn phiên bản đầu vào; sửa đề/lựa chọn/ý kiến làm kết quả cũ mất hiệu lực. Key do bạn cung cấp và phí API thuộc tài khoản của bạn; chỉ chạy khi bạn bấm nút kiểm tra.

Nếu cần model đọc hình, chỉ đánh dấu ảnh cắt chứa riêng đề/sơ đồ là **hình đề dùng cho AI**. Không đánh dấu ảnh có bình luận hoặc đáp án cho lượt giải độc lập. Công cụ không thể tự bảo đảm ảnh đã tách hết nội dung đáp án; người duyệt phải kiểm tra vùng cắt.

AI báo riêng đáp án nghi sai, giải thích nghi sai, ý kiến mâu thuẫn hoặc thiếu dữ kiện. Không phát hiện vấn đề không đồng nghĩa chắc chắn đúng. AI không tự đổi đáp án/lời giải đã duyệt; bạn phải áp dụng và duyệt. Khi gọi API, phần đề/ý kiến và hình cần thiết được gửi đến nhà cung cấp đã chọn.

## Đưa giao diện lên GitHub Pages

1. Tạo repository GitHub cho **thư mục `cung-hoc`**, không đưa cả thư mục Desktop vào repo. Không đưa `private-data/`, `.env.local`, node_modules hoặc key bí mật lên GitHub.
2. Đẩy mã lên nhánh `main`. Tệp `package-lock.json` phải được giữ để workflow dùng `npm ci`.
3. Vào Settings > Secrets and variables > Actions > Variables, thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (cấu hình công khai; vẫn phải bật RLS).
4. Vào Settings > Pages, chọn Source **GitHub Actions**. Workflow `.github/workflows/pages.yml` kiểm tra và build, chỉ tải **dist** lên Pages.
5. Khai báo địa chỉ Pages trong Supabase Auth redirect allowlist và origin trong cấu hình function. Điều hướng dùng hash nên tải lại trang con không cần máy chủ rewrite.

Giao diện mới cần triển khai lại khi đổi mã/cấu hình build. Thêm bộ học và xuất bản câu mới qua Supabase không cần cập nhật repository hoặc build lại.

## Phạm vi kiểm tra

40 kiểm thử tự động đã qua ở lần bàn giao đầu: chấm nhiều đáp án, lịch ôn, thống kê lần đầu, tách câu/import bộ 125 câu, thao tác quiz/flashcard trong DOM kiểm thử, PostgreSQL/RLS/RPC thực chạy trong PGlite, và kiểm tra biên dữ liệu AI. TypeScript của frontend và Edge Function cùng bản build Vite đều qua. Bộ OCR Việt–Anh đã chạy trên ảnh thử tự soạn bằng dữ liệu ngôn ngữ có sẵn trên máy; có lỗi dấu ở vài từ nên vẫn phải duyệt. Đây không phải đánh giá chất lượng trên ảnh chụp thực tế của bạn.

Công cụ trình duyệt hiện bị tắt trong cài đặt Work, nên chưa kiểm tra trực quan hoặc chạy OCR trong trình duyệt thật. Cần dự án Supabase và API key thật để kiểm tra Google OAuth, lưu ảnh online và kết quả AI đầu cuối. PGlite kiểm tra quy tắc SQL nhưng không thay thế kiểm tra Supabase Storage HTTP hay runtime Deno được host. Chưa kiểm tra tải 200 người đồng thời. Khi chưa có thông tin này, không coi bản xem thử là hệ thống online đã xác thực.

Ảnh nguồn và dữ liệu học được giữ ngoài repository công khai. Sao lưu nội dung bằng JSON; gói xuất JSON không mặc nhiên bao gồm toàn bộ byte ảnh, nên cần lưu ảnh gốc hoặc xuất bucket riêng khi sao lưu cloud.
