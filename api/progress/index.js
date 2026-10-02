import { requireAuthenticatedRequest } from "../../src/services/accountAuth.js";

// Tiến độ chưa có database bền vững trên Vercel nên trả lỗi rõ ràng thay vì giả lập.
export default async function handler(req, res) {
    if (!(await requireAuthenticatedRequest(req, res, "Lỗi xác thực tiến độ:"))) {
        return;
    }
    return res.status(503).json({
        error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
    });
}
