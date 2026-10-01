// Chưa lưu bài đã học trên Vercel; không báo thành công khi chưa lưu được dữ liệu.
export default function handler(_req, res) {
    return res.status(503).json({
        error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
    });
}
