# MathHistory AI

Website học tập tương tác về lịch sử Toán học, chuyển từ prototype HTML sang React + Vite và sẵn sàng mở rộng backend.

## Yêu cầu
- Node.js 20+
- npm 10+

## Cài đặt
```bash
npm install
```

## Chạy development
```bash
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

## Trạng thái
Prototype đã có: trang chủ, thư viện tìm kiếm, timeline, AI chat UI/API abstraction, dashboard và quiz tương tác. Authentication, PostgreSQL, lưu progress thật, admin CMS và AI production cần backend tương ứng.
