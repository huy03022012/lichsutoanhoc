# MathHistory AI

Website học tập tương tác về lịch sử Toán học, dùng React/Vite làm frontend và Express làm backend.

## Sơ đồ nhanh để tìm chỗ cần sửa
- `src/App.jsx`: các màn hình, điều hướng và xử lý hội thoại ở trình duyệt.
- `src/styles.css`: bố cục, màu sắc, responsive và giao diện chat.
- `src/components/chat/`: định dạng Markdown/công thức KaTeX của tin nhắn AI.
- `src/main.jsx`: điểm khởi chạy React, nạp CSS ứng dụng và gắn `App` vào trang.
- `src/data/content.js`: bài học, nguồn tham khảo, dòng thời gian và quiz.
- `src/services/api.js`: các yêu cầu API mà frontend gửi lên backend.
- `src/services/server.js`: API Express khi chạy local hoặc Node server.
- `api/`: Vercel Functions; Vercel dùng các handler này thay cho Express `app.listen`.
- `src/services/aiPrompt.js`: giới hạn chủ đề và quy tắc hướng dẫn của AI.
- `src/services/aiImage.js`: loại ảnh, giới hạn dung lượng và kiểm tra payload gửi tới AI.
- `src/services/accountAuth.js`: mã hóa mật khẩu, phiên đăng nhập cookie và kiểm tra quyền ở backend.
- `src/components/assignments/`: giao diện tạo/làm bài tập và nhận xét bài nộp.
- `supabase/schema.sql`: các bảng tài khoản, phiên đăng nhập, bài tập và bài nộp.
- `index.html`: ngôn ngữ trang, metadata trình duyệt và điểm gắn React.
- `public/favicon.svg`: logo nhỏ hiển thị trên tab trình duyệt.
- `.gitignore`: các file/mục không được đưa vào Git.
- `.env.example`: danh sách biến môi trường mẫu; sao chép thành `.env` để chạy local.
- `vite.config.js`: máy chủ phát triển, proxy API và cấu hình preview.
- `package.json`: lệnh chạy cùng thư viện runtime/development.
- `vercel.json`: lệnh build, thư mục output và giới hạn thời gian Function.

Khi sửa một tính năng, thường cần kiểm tra cả giao diện (`src/App.jsx`), kiểu dáng (`src/styles.css`) và API tương ứng. Các chú thích tiếng Việt trong mã giải thích luồng xử lý hoặc giới hạn triển khai; không phải dòng code nào cũng có chú thích vì các biểu thức đơn giản được giải thích rõ hơn qua tên biến/hàm.

Lịch sử tối đa 10 cuộc trò chuyện được lưu bằng `localStorage` trên trình duyệt hiện tại, nên vẫn còn sau khi đóng rồi mở lại website. Dữ liệu không được gửi lên Vercel và không tự đồng bộ sang trình duyệt/thiết bị khác; người dùng có thể xóa từng cuộc hoặc xóa toàn bộ trong giao diện chat.

Trên màn hình rộng, điều hướng nằm trên thanh đầu trang; trên điện thoại/tablet (màn hình rộng tối đa 850 px), dùng nút ba gạch để mở menu. Menu đóng khi chọn trang, chạm vùng bên ngoài hoặc nhấn Escape.

`package.json`, `vercel.json` và `package-lock.json` là JSON; JSON chuẩn không cho phép comment. Vì vậy phần giải thích cấu hình nằm trong mục sơ đồ này: `package.json` định nghĩa scripts/thư viện, `vercel.json` cấu hình build và serverless function, còn `package-lock.json` khóa phiên bản dependency chính xác và được npm tự sinh nên không nên chỉnh tay.

## Yêu cầu
- Node.js 20+
- npm 10+

## Cài đặt
```bash
npm install
```

## Chạy development
```bash
# Terminal 1
npm run server
# Terminal 2
npm run dev
```

## Build production
```bash
npm run build
```

## Preview production
```bash
npm run preview
```

## AI backend
Frontend gọi `POST /api/ai/chat`; AI dùng model `gemini-3.5-flash`, hỗ trợ Lịch sử Toán học và bài tập từ văn bản/ảnh. Mặc định AI chỉ đưa phương pháp, câu hỏi gợi mở và gợi ý, không đưa đáp số. Khi học sinh đã làm xong, bật nút `Chấm bài đã làm` để AI nhận xét đúng/sai, góp ý và trình bày lời giải mẫu để đối chiếu; nếu chưa gửi bài làm, AI sẽ hỏi phần đã làm thay vì tự giải. Chỉ dẫn này được truyền bằng cờ `checkWork` riêng tới API. Người dùng có thể mở camera để chụp (chọn camera trước/sau) hoặc chọn ảnh có sẵn. Ảnh JPEG/PNG/WebP tối đa 3 MB được gửi đến backend rồi chuyển cho Gemini phân tích. Camera cần được cấp quyền; khi deploy, trình duyệt yêu cầu HTTPS. Ảnh không được lưu vào Vercel hoặc localStorage; lịch sử trình duyệt chỉ ghi tên ảnh.

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

Không đặt API key của mô hình AI trong frontend.

## Deploy trên Vercel
Import repository vào Vercel; cấu hình build là `npm run build`, output là `dist`. Vercel Functions nằm trong `api/`, gồm `GET /api/content` và `POST /api/ai/chat`. Thêm `GEMINI_API_KEY` trong Project Settings → Environment Variables rồi redeploy.

Backend cung cấp `GET /api/content`, `GET /api/progress`, `POST /api/progress/lessons/:lessonId` và `POST /api/progress/quiz`. Tiến độ được lưu trong `data/progress.json` (thư mục này không đưa vào Git); có thể đặt `PROGRESS_FILE` để dùng đường dẫn trên ổ đĩa bền vững.

## Tài khoản, phân quyền và bài tập
Hệ thống dùng Supabase làm cơ sở dữ liệu; mật khẩu được băm scrypt ở backend, còn phiên đăng nhập dùng cookie HttpOnly. Chạy `supabase/schema.sql` trong SQL Editor, sau đó cấu hình `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` ở máy local và Vercel. Service-role key chỉ được đặt ở backend. Form đăng ký dùng Cloudflare Turnstile: tạo site key và secret key trong Cloudflare Turnstile, thêm `VITE_TURNSTILE_SITE_KEY` (site key công khai, dùng lúc build frontend) và `TURNSTILE_SECRET_KEY` (chỉ backend) vào môi trường. Cấu hình cả hai biến trong Vercel Project Settings → Environment Variables rồi redeploy; ở local, đặt chúng trong `.env`. Với Express local tại `localhost:3000`, frontend được phục vụ từ thư mục `dist`: chạy lại `npm run build` sau khi thêm hoặc đổi site key, rồi khởi động lại `npm start` sau khi thêm hoặc đổi secret key. Cấu hình domain production trong Turnstile; khi chạy local, thêm `localhost` hoặc dùng test keys Cloudflare. Thiếu một trong hai khóa thì đăng ký bị chặn an toàn.

Mọi người phải đăng nhập mới xem học liệu, dùng bài tập hoặc gọi trợ giảng AI; API cũng yêu cầu phiên hợp lệ. Đăng ký công khai vẫn mở và tài khoản mới mặc định là học sinh. Tên đăng nhập mới dài 3–24 ký tự, viết liền không dấu, chỉ gồm chữ cái a-z và số 0-9; tên hiển thị riêng hỗ trợ tiếng Việt. Khi đăng ký phải nhập lại mật khẩu; mật khẩu tối thiểu 8 ký tự. Tài khoản đã đăng nhập ở mọi vai trò có thể tự đổi mật khẩu từ thanh tài khoản bằng cách xác nhận mật khẩu hiện tại. Tài khoản cũ có tên đăng nhập dấu/khoảng trắng vẫn có thể đăng nhập cho đến khi đổi sang tên mới. Tài khoản đầu tiên cần tự đăng ký, rồi chủ dự án dùng SQL Editor để cấp quyền super admin gốc: `update public.account_users set role = 'super_admin', is_root_admin = true where username = 'ten_dang_nhap';`. Super admin gốc không thể bị xóa, khóa hoặc tước vai trò; các super admin khác không thể sửa tài khoản này. Không dùng email nên không có tự khôi phục mật khẩu; admin có thể đổi username/mật khẩu cho giáo viên và học sinh, super admin có thể đổi thông tin của mọi vai trò.

Giáo viên, admin và super admin có thể thêm học liệu tại trang Thư viện. Mỗi bài gồm tiêu đề, chủ đề, biểu tượng, mốc thời gian, giới thiệu, nội dung và nguồn tham khảo tùy chọn; khi lưu, hệ thống tự thêm mốc vào Dòng thời gian từ năm, tiêu đề và giới thiệu của bài. Học liệu do người dùng thêm được lưu trong bảng `math_library_lessons`. Chạy lại toàn bộ `supabase/schema.sql` trong Supabase SQL Editor để tạo bảng mới trước khi sử dụng tính năng này.

Giáo viên, admin và super admin có thể tạo bài tập trắc nghiệm, tự luận hoặc tổng hợp, tối đa 50 câu và tổng điểm đúng 10; có thể chia điểm đều hoặc tự đặt điểm từng câu. Câu trắc nghiệm có 2–10 lựa chọn và đáp án đúng. Mỗi câu tự luận mới cần đáp án tham khảo; khi học sinh nộp, backend gửi đề, đáp án tham khảo và bài làm đến Gemini để chấm theo ý nghĩa, lập luận và điểm từng câu. Học sinh chỉ thấy điểm cùng nhận xét AI, không được nhận đáp án tham khảo; giáo viên có thể xem đáp án, chỉnh điểm AI và viết nhận xét. Điểm AI là gợi ý, điểm giáo viên chấm lại được ưu tiên khi hiển thị. Các bài tự luận cũ không có câu hỏi vẫn tiếp tục nhận xét thủ công. Mỗi bài tập chỉ nộp một lần; sau khi nộp thành công, học sinh không thể sửa hoặc nộp lại. Giáo viên xem bài và nhận xét, xóa bài tập do mình tạo; admin/super admin có thể quản lý toàn bộ bài tập. Xóa bài tập sẽ xóa cả bài nộp liên quan. Cần cấu hình `GEMINI_API_KEY` ở backend để bật chấm tự luận AI. Sau cập nhật, chạy lại `supabase/schema.sql` trong Supabase SQL Editor để thêm các cột mới. Trong quản lý tài khoản, super admin có thể chọn nhiều tài khoản dưới quyền (học sinh, giáo viên, admin) để xóa riêng hoặc hàng loạt. Tài khoản super admin gốc, tài khoản đang đăng nhập và super admin hoạt động cuối cùng vẫn được bảo vệ. Admin chỉ có thể yêu cầu xóa tài khoản học sinh và phải được super admin duyệt. Xóa tài khoản xóa bài tập do tài khoản đó tạo và bài nộp liên quan.

Để cấu hình local, sao chép `.env.example` thành `.env`, điền Project URL và service-role/secret key của Supabase, rồi khởi động lại `npm run server`. Trên Vercel, thêm cùng hai biến trong **Settings → Environment Variables** (không có tiền tố `VITE_`) và redeploy. Sau khi chạy schema, đăng ký tài khoản đầu tiên trên website rồi chạy lệnh SQL ở trên để cấp super admin gốc; đảm bảo câu lệnh cập nhật đúng một tài khoản. Không chia sẻ hoặc commit secret key.

## Chạy production
```bash
npm run build
npm start
```

Trước khi chạy AI, sao chép `.env.example` thành `.env` và đặt `GEMINI_API_KEY` ở backend. Nếu khóa đã từng bị lộ, hãy thu hồi và tạo khóa mới trong Google AI Studio.
