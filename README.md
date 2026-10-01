# MathHistory AI

Website học tập tương tác về lịch sử Toán học, dùng React/Vite làm frontend và Express làm backend.

## Sơ đồ nhanh để tìm chỗ cần sửa
- `src/App.jsx`: các màn hình, điều hướng và xử lý hội thoại ở trình duyệt.
- `src/styles.css`: bố cục, màu sắc, responsive và giao diện chat.
- `src/components/chat/`: định dạng Markdown/công thức KaTeX của tin nhắn AI.
- `src/data/content.js`: bài học, nguồn tham khảo, dòng thời gian và quiz.
- `src/services/api.js`: các yêu cầu API mà frontend gửi lên backend.
- `src/services/server.js`: API Express khi chạy local hoặc Node server.
- `api/`: Vercel Functions; Vercel dùng các handler này thay cho Express `app.listen`.
- `src/services/aiPrompt.js` và `src/services/aiRateLimit.js`: giới hạn chủ đề AI và hạn mức gọi AI.
- `index.html`: ngôn ngữ trang, metadata trình duyệt và điểm gắn React.
- `.gitignore`: các file/mục không được đưa vào Git.
- `vite.config.js`: máy chủ phát triển, proxy API và cấu hình preview.
- `package.json`: lệnh chạy cùng thư viện runtime/development.
- `vercel.json`: lệnh build, thư mục output và giới hạn thời gian Function.

Khi sửa một tính năng, thường cần kiểm tra cả giao diện (`src/App.jsx`), kiểu dáng (`src/styles.css`) và API tương ứng. Các chú thích tiếng Việt trong mã giải thích luồng xử lý hoặc giới hạn triển khai; không phải dòng code nào cũng có chú thích vì các biểu thức đơn giản được giải thích rõ hơn qua tên biến/hàm.

`package.json`, `vercel.json` và `package-lock.json` là JSON; JSON chuẩn không cho phép comment. Vì vậy phần giải thích cấu hình nằm trong mục sơ đồ này; `package-lock.json` được npm tự sinh nên không nên chỉnh tay.

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
Frontend gọi `POST /api/ai/chat`; AI dùng model `gemini-3.5-flash-lite` và chỉ hỗ trợ chủ đề Lịch sử Toán học.

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

Không đặt API key của mô hình AI trong frontend.

## Deploy trên Vercel
Import repository vào Vercel; cấu hình build là `npm run build`, output là `dist`. Vercel Functions nằm trong `api/`, gồm `GET /api/content` và `POST /api/ai/chat`. Thêm `GEMINI_API_KEY` trong Project Settings → Environment Variables rồi redeploy.

AI giới hạn 20 câu hỏi mỗi 15 phút cho mỗi IP. Để bộ giới hạn dùng chung giữa các serverless instance, cấu hình thêm `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` trong Vercel. Nếu không cấu hình Redis, giới hạn chỉ được giữ trong từng instance và có thể không đồng nhất khi Vercel scale.

Backend cung cấp `GET /api/content`, `GET /api/progress`, `POST /api/progress/lessons/:lessonId` và `POST /api/progress/quiz`. Tiến độ được lưu trong `data/progress.json` (thư mục này không đưa vào Git); có thể đặt `PROGRESS_FILE` để dùng đường dẫn trên ổ đĩa bền vững.

**Giới hạn hiện tại:** project chưa có đăng ký/đăng nhập hoặc phân quyền, vì vậy tiến độ JSON hiện chưa thể tách theo tài khoản và không phù hợp triển khai nhiều người dùng. Cần xây dựng authentication và lưu trữ theo user trước khi dùng như sản phẩm có nhiều tài khoản.

## Chạy production
```bash
npm run build
npm start
```

Trước khi chạy AI, sao chép `.env.example` thành `.env` và đặt `GEMINI_API_KEY` ở backend. Nếu khóa đã từng bị lộ, hãy thu hồi và tạo khóa mới trong Google AI Studio.
