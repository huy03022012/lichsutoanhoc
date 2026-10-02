import { GoogleGenAI } from "@google/genai";
import { validateAiImage } from "../../src/services/aiImage.js";
import { AI_SYSTEM_INSTRUCTION } from "../../src/services/aiPrompt.js";

const model = "gemini-3.5-flash-lite";

// Serverless endpoint cho POST /api/ai/chat; GEMINI_API_KEY chỉ đọc ở server.
export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
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
            config: { systemInstruction: AI_SYSTEM_INSTRUCTION },
        });
        if (!response.text) {
            return res
                .status(502)
                .json({ error: "Dịch vụ AI không trả về nội dung." });
        }
        return res.status(200).json({ success: true, answer: response.text });
    } catch (error) {
        console.error("Lỗi gọi Gemini trên Vercel:", error);
        return res.status(502).json({
            error: "Gemini không xử lý được yêu cầu. Kiểm tra model và API key trong Vercel.",
        });
    }
}
