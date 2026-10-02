import { requireAuthenticatedRequest } from "../../../src/services/accountAuth.js";

// Chưa lưu bài đã học trên Vercel; không báo thành công khi chưa lưu được dữ liệu.
export default async function handler(req, res) {
    if (!(await requireAuthenticatedRequest(req, res, "Lỗi xác thực tiến độ:"))) {
        return;
    }
    return res.status(503).json({
        error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
    });
}
