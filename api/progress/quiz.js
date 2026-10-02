import { requireAuthenticatedRequest } from "../../src/services/accountAuth.js";

// Chưa lưu kết quả quiz trên Vercel cho đến khi được nối với database bền vững.
export default async function handler(req, res) {
    if (!(await requireAuthenticatedRequest(req, res, "Lỗi xác thực tiến độ:"))) {
        return;
    }
    return res.status(503).json({
        error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
    });
}
