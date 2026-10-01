# MathHistory AI

Website học tập tương tác về lịch sử Toán học, dùng React/Vite làm frontend và Express làm backend.

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
Frontend gọi `POST /api/ai/chat`. Có thể đặt URL backend bằng biến môi trường:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

Không đặt API key của mô hình AI trong frontend.

Backend cung cấp `GET /api/content`, `GET /api/progress`, `POST /api/progress/lessons/:lessonId` và `POST /api/progress/quiz`. Tiến độ được lưu trong `data/progress.json` (thư mục này không đưa vào Git); có thể đặt `PROGRESS_FILE` để dùng đường dẫn trên ổ đĩa bền vững.

**Giới hạn hiện tại:** project chưa có đăng ký/đăng nhập hoặc phân quyền, vì vậy tiến độ JSON hiện chưa thể tách theo tài khoản và không phù hợp triển khai nhiều người dùng. Cần xây dựng authentication và lưu trữ theo user trước khi dùng như sản phẩm có nhiều tài khoản.

## Chạy production
```bash
npm run build
npm start
```

Trước khi chạy AI, sao chép `.env.example` thành `.env` và đặt `GEMINI_API_KEY` ở backend. Nếu khóa đã từng bị lộ, hãy thu hồi và tạo khóa mới trong Google AI Studio.
