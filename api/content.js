import { lessons, quiz, timeline } from "../src/data/content.js";
import {
    getDatabase,
    requireUser,
    sendApiError,
} from "../src/services/accountAuth.js";
import { loadAdditionalLibraryContent } from "../src/services/libraryContent.js";

// Vercel gọi handler này cho GET /api/content để frontend khởi tạo dữ liệu.
// Endpoint yêu cầu phiên hợp lệ và chỉ trả dữ liệu học tập công khai, không gồm đáp án quiz.
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res
            .status(405)
            .json({ error: "Phương thức không được hỗ trợ." });
    }

    try {
        const db = getDatabase();
        await requireUser(db, req);
        const additionalContent = await loadAdditionalLibraryContent(db);
        return res.status(200).json({
            lessons: [...lessons, ...additionalContent.lessons],
            timeline: [...timeline, ...additionalContent.timeline],
            librarySchemaReady: additionalContent.schemaReady,
            librarySchemaWarning: additionalContent.schemaWarning,
            // Không gửi đáp án đúng ra trình duyệt.
            quiz: { question: quiz.question, options: quiz.options },
        });
    } catch (error) {
        return sendApiError(res, error, "Lỗi xác thực học liệu:");
    }
}
