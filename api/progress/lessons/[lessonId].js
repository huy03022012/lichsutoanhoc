import { requireAuthenticatedRequest } from "../../../src/services/accountAuth.js";

// Chưa có kho tiến độ bền vững trên Vercel; xác thực trước rồi trả 503 rõ ràng,
// không giả lập thành công hoặc ghi dữ liệu chỉ tồn tại trong bộ nhớ tạm của function.
export default async function handler(req, res) {
    if (!(await requireAuthenticatedRequest(req, res, "Lỗi xác thực tiến độ:"))) {
        return;
    }
    return res.status(503).json({
        error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
    });
}
