// Tiến độ chưa có database bền vững trên Vercel nên trả lỗi rõ ràng thay vì giả lập.
export default function handler(_req, res) {
    return res.status(503).json({
        error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
    });
}
