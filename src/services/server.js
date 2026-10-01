import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Chưa cấu hình GEMINI_API_KEY");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.post("/api/ai/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                error: "Vui lòng nhập câu hỏi."
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: message
        });

        res.json({
            success: true,
            answer: response.text
        });

    } catch (error) {
        console.error("Gemini error:", error);

        res.status(500).json({
            success: false,
            error: "Không thể kết nối Gemini."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🤖 AI Server chạy tại http://localhost:${PORT}`);
});