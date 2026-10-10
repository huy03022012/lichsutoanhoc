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
Để dùng Gmail SMTP, chỉ deploy frontend lên Vercel; chạy backend Express (`src/services/server.js`) trên một máy chủ Node.js cho phép kết nối SMTP. Trên nơi host backend, chạy `npm run build && npm start` và cấu hình các biến backend trong `.env`/Environment Variables. Đặt `CLIENT_ORIGIN` thành origin frontend Vercel, ví dụ `https://ten-project.vercel.app`. Trong Vercel, đặt `VITE_API_BASE_URL` thành URL backend cộng `/api` (ví dụ `https://api.example.com/api`) rồi redeploy frontend. Không dùng Vercel Functions làm mail backend vì SMTP có thể bị chặn ở môi trường đó.

Backend Express cung cấp các API tài khoản, học liệu, bài tập, AI và tiến độ. Tiến độ JSON được lưu trong `data/progress.json`; khi host backend riêng, cần ổ đĩa bền vững và có thể đặt `PROGRESS_FILE`. Tài khoản và mã xác minh vẫn lưu trong Supabase.

## Tài khoản, phân quyền và bài tập
Đăng nhập, yêu cầu mã đăng ký và yêu cầu đặt lại mật khẩu đều dùng Cloudflare Turnstile, với action riêng được xác minh ở backend. Sau 10 lần nhập sai mật khẩu cho cùng tên tài khoản, đăng nhập sẽ tạm khóa tài khoản đó trong thời gian ngẫu nhiên từ 10 đến 20 phút; đăng nhập thành công sẽ xóa bộ đếm. Không giới hạn theo IP để tránh ảnh hưởng nhiều người dùng chung mạng. Super admin có thể mở tài khoản trong Quản lý tài khoản và chọn **Đặt lại lượt đăng nhập** để xóa bộ đếm sai và thời gian chờ. Thao tác này chỉ gỡ khóa do nhập sai nhiều lần, không mở khóa tài khoản bị quản trị viên khóa thủ công. Chạy lại toàn bộ `supabase/schema.sql` trong Supabase SQL Editor để tạo/cập nhật bảng và RPC, gồm các bảng giới hạn đăng nhập và mã xác thực email. Tạo site key và secret key trong Cloudflare Turnstile; đặt `VITE_TURNSTILE_SITE_KEY` (site key công khai) trên Vercel lúc build frontend, còn `TURNSTILE_SECRET_KEY` chỉ đặt ở backend Node. Ở local, đặt cả hai trong `.env`. Cấu hình domain frontend production trong Turnstile; khi chạy local, thêm `localhost` hoặc dùng test keys Cloudflare. Thiếu một trong hai khóa thì các thao tác được bảo vệ bằng CAPTCHA bị chặn an toàn.

Mọi người phải đăng nhập mới xem học liệu, dùng bài tập hoặc gọi trợ giảng AI; API cũng yêu cầu phiên hợp lệ. Đăng ký công khai vẫn mở và tài khoản mới mặc định là học sinh. Tên đăng nhập mới dài 3–24 ký tự, viết liền không dấu, chỉ gồm chữ cái a-z và số 0-9; tên hiển thị riêng hỗ trợ tiếng Việt. Đăng ký yêu cầu email xác thực bằng mã 6 chữ số và nhập lại mật khẩu; mật khẩu dài 8–128 ký tự. Người đã đăng nhập ở mọi vai trò có thể liên kết hoặc cập nhật email bằng mã xác minh từ menu tài khoản, và tự đổi mật khẩu bằng cách xác nhận mật khẩu hiện tại. Tài khoản cũ có tên đăng nhập dấu/khoảng trắng vẫn có thể đăng nhập cho đến khi đổi sang tên mới. Nếu chủ tài khoản cũ quên mật khẩu trước khi liên kết email, cần nhờ quản trị viên hỗ trợ một lần; sau khi email được xác thực, người dùng có thể tự khôi phục. Tài khoản đầu tiên cần tự đăng ký, rồi chủ dự án dùng SQL Editor để cấp quyền super admin gốc: `update public.account_users set role = 'super_admin', is_root_admin = true where username = 'ten_dang_nhap';`. Super admin gốc không thể bị xóa, khóa hoặc tước vai trò; các super admin khác không thể sửa tài khoản này. Người dùng chọn “Quên mật khẩu?” để nhận mã qua email đã xác minh; đặt lại mật khẩu sẽ đăng xuất các phiên hiện có. Admin có thể đổi username/mật khẩu cho giáo viên và học sinh, super admin có thể đổi thông tin của mọi vai trò.

Giáo viên, admin và super admin có thể thêm học liệu tại trang Thư viện. Mỗi bài gồm tiêu đề, chủ đề, biểu tượng, mốc thời gian, giới thiệu, nội dung và nguồn tham khảo tùy chọn; khi lưu, hệ thống tự thêm mốc vào Dòng thời gian từ năm, tiêu đề và giới thiệu của bài. Học liệu do người dùng thêm được lưu trong bảng `math_library_lessons`. Chạy lại toàn bộ `supabase/schema.sql` trong Supabase SQL Editor để tạo bảng mới trước khi sử dụng tính năng này.

Giáo viên, admin và super admin có thể tạo bài tập trắc nghiệm, tự luận hoặc tổng hợp, tối đa 50 câu và tổng điểm đúng 10; có thể chia điểm đều hoặc tự đặt điểm từng câu. Câu trắc nghiệm có 2–10 lựa chọn và đáp án đúng. Mỗi câu tự luận mới cần đáp án tham khảo; khi học sinh nộp, backend gửi đề, đáp án tham khảo và bài làm đến Gemini để chấm theo ý nghĩa, lập luận và điểm từng câu. Học sinh chỉ thấy điểm cùng nhận xét AI, không được nhận đáp án tham khảo; giáo viên có thể xem đáp án, chỉnh điểm AI và viết nhận xét. Điểm AI là gợi ý, điểm giáo viên chấm lại được ưu tiên khi hiển thị. Các bài tự luận cũ không có câu hỏi vẫn tiếp tục nhận xét thủ công. Mỗi bài tập chỉ nộp một lần; sau khi nộp thành công, học sinh không thể sửa hoặc nộp lại. Giáo viên xem bài và nhận xét, xóa bài tập do mình tạo; admin/super admin có thể quản lý toàn bộ bài tập. Xóa bài tập sẽ xóa cả bài nộp liên quan. Cần cấu hình `GEMINI_API_KEY` ở backend để bật chấm tự luận AI. Sau cập nhật, chạy lại `supabase/schema.sql` trong Supabase SQL Editor để thêm các cột mới. Trong quản lý tài khoản, super admin có thể chọn nhiều tài khoản dưới quyền (học sinh, giáo viên, admin) để xóa riêng hoặc hàng loạt. Tài khoản super admin gốc, tài khoản đang đăng nhập và super admin hoạt động cuối cùng vẫn được bảo vệ. Admin chỉ có thể yêu cầu xóa tài khoản học sinh và phải được super admin duyệt. Xóa tài khoản xóa bài tập do tài khoản đó tạo và bài nộp liên quan.

Để gửi mã xác minh qua Gmail miễn phí, sao chép `.env.example` thành `.env` cho backend, điền Project URL và service-role/secret key của Supabase. Bật xác minh 2 bước cho tài khoản Google gửi thư, tạo **App Password** (mật khẩu ứng dụng) trong phần bảo mật tài khoản Google, rồi đặt email đó vào `GMAIL_USER` và App Password vào `GMAIL_APP_PASSWORD` trong biến môi trường backend. Không dùng mật khẩu đăng nhập Google thường và không chia sẻ hoặc commit App Password. Gmail có giới hạn gửi thư; máy chủ host backend phải cho phép kết nối SMTP. Sau khi chạy schema, đăng ký tài khoản đầu tiên trên website rồi chạy lệnh SQL ở trên để cấp super admin gốc; đảm bảo câu lệnh cập nhật đúng một tài khoản.

Trợ giảng AI giới hạn mỗi tài khoản 20 yêu cầu trong mỗi cửa sổ 10 phút; chỉ tài khoản super admin gốc được dùng không giới hạn. Lượt cấp thêm là lượt dùng một lần và không tự cộng lại khi cửa sổ làm mới. Màn hình AI hiển thị lượt còn lại. Super admin có thể mở Quản lý tài khoản để bỏ giới hạn, bật lại quota mặc định, đặt lại lượt hoặc cấp thêm lượt cho tài khoản khác. Chạy lại `supabase/schema.sql` để tạo bảng và RPC quản lý quota AI.

## Chạy production
```bash
npm run build
npm start
```

Trước khi chạy AI, sao chép `.env.example` thành `.env` và đặt `GEMINI_API_KEY` ở backend. Có thể thêm nhiều khóa dự phòng trong `GEMINI_API_KEYS`, phân tách bằng dấu phẩy (hoặc mỗi khóa một dòng); khi Gemini trả lỗi hết quota/rate limit cho một khóa, backend tự thử khóa kế tiếp. Ví dụ:

```env
GEMINI_API_KEY=khóa_chính
GEMINI_API_KEYS=khóa_dự_phòng_1,khóa_dự_phòng_2
```

Đặt các biến này trong Environment Variables của Vercel hoặc môi trường chạy backend Node, không đặt trong biến frontend có tiền tố `VITE_`. Nếu một khóa đã từng bị lộ, hãy thu hồi và tạo khóa mới trong Google AI Studio.
