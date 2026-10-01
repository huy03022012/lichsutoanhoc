import { GoogleGenAI } from "@google/genai";
import { checkAiRateLimit } from "../../src/services/aiRateLimit.js";
import { AI_SYSTEM_INSTRUCTION } from "../../src/services/aiPrompt.js";

const model = "gemini-3.5-flash-lite";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
    }

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

    let rateLimit;
    try {
        rateLimit = await checkAiRateLimit(req);
    } catch (error) {
        console.error("Lỗi bộ giới hạn AI:", error);
        return res.status(503).json({
            error: "Không thể kiểm tra giới hạn AI. Vui lòng thử lại sau.",
        });
    }
    res.setHeader("RateLimit-Limit", "20");
    res.setHeader("RateLimit-Remaining", String(Math.max(0, 20 - rateLimit.count)));
    res.setHeader("Retry-After", String(rateLimit.retryAfter));
    if (!rateLimit.allowed) {
        return res.status(429).json({
            error: "Bạn đã gửi quá 20 câu hỏi trong 15 phút. Vui lòng thử lại sau.",
        });
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model,
            contents: message,
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
