import { GoogleGenAI } from "@google/genai";
import { validateAiImage } from "../../src/services/aiImage.js";
import { buildAiSystemInstruction } from "../../src/services/aiPrompt.js";
import {
    getDatabase,
    requireAuthenticatedRequest,
} from "../../src/services/accountAuth.js";
import { consumeAiUsage, getAiUsage } from "../../src/services/aiUsage.js";

const model = "gemini-3.5-flash-lite";

// Serverless endpoint cho /api/ai/chat; GEMINI_API_KEY chỉ đọc ở server.
// Xác thực dùng chung được chạy trước cả GET hạn mức và POST gửi prompt.
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "POST"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
    }

    if (!(await requireAuthenticatedRequest(req, res, "Lỗi xác thực AI:"))) {
        return;
    }

    const db = getDatabase();
    if (req.method === "GET") {
        try {
            const usage = await getAiUsage(db, req.authenticatedUserId);
            return res.status(200).json({ usage });
        } catch (error) {
            console.error("Không thể đọc hạn mức sử dụng AI:", error);
            return res.status(503).json({
                error: "Không thể tải số lượt AI hiện tại. Hãy thử lại.",
            });
        }
    }

    const message =
        typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const image = req.body?.image ?? null;
    const checkWork = req.body?.checkWork === true;
    if (!message && !image) {
        return res.status(400).json({ error: "Hãy nhập câu hỏi hoặc gửi ảnh bài tập." });
    }
    if (message.length > 2000) {
        return res
            .status(400)
            .json({ error: "Câu hỏi không được dài quá 2000 ký tự." });
    }
    const imageError = validateAiImage(image);
    if (imageError) {
        return res.status(400).json({ error: imageError });
    }
    if (!process.env.GEMINI_API_KEY) {
        return res
            .status(503)
            .json({ error: "Chưa cấu hình GEMINI_API_KEY trên Vercel." });
    }

    let usage;
    try {
        // consumeAiUsage dùng RPC nguyên tử: cấp lượt trước khi gọi mô hình để không
        // có hai request song song cùng dùng lượt cuối; lỗi AI vẫn tính là một lần thử.
        usage = await consumeAiUsage(db, req.authenticatedUserId);
    } catch (error) {
        console.error("Không thể kiểm tra hạn mức sử dụng AI:", error);
        return res.status(503).json({
            error: "Không thể kiểm tra hạn mức AI. Hãy thử lại.",
        });
    }
    if (!usage.allowed) {
        return res.status(429).json({
            error: "Bạn đã dùng hết lượt AI trong khung 10 phút. Hãy chờ hạn mức được làm mới hoặc liên hệ super admin.",
            usage,
        });
    }

    try {
        // Khởi tạo client trong backend và yêu cầu mô hình chỉ trả lời đúng chủ đề.
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const parts = [];
        // Chế độ chấm bài chỉ được kích hoạt bởi cờ riêng từ nút trên giao diện.
        parts.push({
            text: checkWork
                ? "CHẾ ĐỘ CHẤM BÀI ĐÃ BẬT. Hãy chấm phần làm của học sinh, góp ý lỗi và trình bày lời giải mẫu để đối chiếu nếu dữ liệu đủ rõ."
                : "CHẾ ĐỘ GỢI Ý ĐANG BẬT. Không đưa đáp số cuối cùng hoặc lời giải hoàn chỉnh.",
        });
        if (message || image) {
            parts.push({
                text:
                    message ||
                    (checkWork
                        ? "Hãy chấm bài làm và đáp án học sinh gửi trong ảnh; nếu không thấy bài làm, hãy yêu cầu học sinh gửi bài đã làm."
                        : "Phân tích bài tập trong ảnh và chỉ gợi ý phương pháp giải, không đưa đáp số."),
            });
        }
        if (image) {
            parts.push({
                inlineData: { mimeType: image.mimeType, data: image.data },
            });
        }
        const response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
                systemInstruction: buildAiSystemInstruction(
                    req.authenticatedDisplayName,
                ),
            },
        });
        if (!response.text) {
            return res
                .status(502)
                .json({ error: "Dịch vụ AI không trả về nội dung." });
        }
        return res
            .status(200)
            .json({ success: true, answer: response.text, usage });
    } catch (error) {
        console.error("Lỗi gọi Gemini trên Vercel:", error);
        return res.status(502).json({
            error: "Gemini không xử lý được yêu cầu. Kiểm tra model và API key trong Vercel.",
        });
    }
}
