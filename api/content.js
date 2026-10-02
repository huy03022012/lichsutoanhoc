import { lessons, quiz, timeline } from "../src/data/content.js";
import { requireAuthenticatedRequest } from "../src/services/accountAuth.js";

// Vercel gọi handler này cho GET /api/content để frontend khởi tạo dữ liệu.
export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res
            .status(405)
            .json({ error: "Phương thức không được hỗ trợ." });
    }

    if (!(await requireAuthenticatedRequest(req, res, "Lỗi xác thực học liệu:"))) {
        return;
    }

    return res.status(200).json({
        lessons,
        timeline,
        // Không gửi đáp án đúng ra trình duyệt.
        quiz: { question: quiz.question, options: quiz.options },
    });
}
