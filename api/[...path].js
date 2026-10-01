import { GoogleGenAI } from "@google/genai";
import { lessons, quiz, timeline } from "../src/data/content.js";

const model = "gemini-3.5-flash-lite";

export default async function handler(req, res) {
    const route = Array.isArray(req.query.path)
        ? req.query.path.join("/")
        : String(req.query.path || "");

    if (req.method === "GET" && route === "content") {
        return res.status(200).json({
            lessons,
            timeline,
            quiz: { question: quiz.question, options: quiz.options },
        });
    }

    if (req.method === "POST" && route === "ai/chat") {
        const message =
            typeof req.body?.message === "string" ? req.body.message.trim() : "";
        if (!message) {
            return res.status(400).json({ error: "Vui lòng nhập câu hỏi." });
        }
        if (message.length > 2000) {
            return res
                .status(400)
                .json({ error: "Câu hỏi không được dài quá 2000 ký tự." });
        }
        if (!process.env.GEMINI_API_KEY) {
            return res
                .status(503)
                .json({ error: "Chưa cấu hình GEMINI_API_KEY trên Vercel." });
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model,
                contents: message,
            });
            if (!response.text) {
                return res
                    .status(502)
                    .json({ error: "Dịch vụ AI không trả về nội dung." });
            }
            return res.status(200).json({ success: true, answer: response.text });
        } catch (error) {
            console.error("Lỗi gọi Gemini trên Vercel:", error);
            return res
                .status(502)
                .json({ error: "Gemini từ chối hoặc không xử lý được yêu cầu." });
        }
    }

    if (route.startsWith("progress")) {
        return res.status(503).json({
            error: "API tiến độ chưa có kho lưu trữ bền vững được cấu hình trên Vercel.",
        });
    }

    return res.status(404).json({ error: "Không tìm thấy API endpoint." });
}
