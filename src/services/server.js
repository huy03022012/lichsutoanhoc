import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { lessons, quiz, timeline } from "../data/content.js";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const dataFile = process.env.PROGRESS_FILE
    ? resolve(process.env.PROGRESS_FILE)
    : join(dirname(fileURLToPath(import.meta.url)), "../../data/progress.json");
const distDirectory = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../dist",
);

function readProgress() {
    if (!existsSync(dataFile))
        return { completedLessonIds: [], quizzesCompleted: 0, quizCorrect: 0 };
    const progress = JSON.parse(readFileSync(dataFile, "utf8"));
    if (
        !progress ||
        !Array.isArray(progress.completedLessonIds) ||
        !Number.isInteger(progress.quizzesCompleted) ||
        !Number.isInteger(progress.quizCorrect ?? 0)
    ) {
        throw new Error("Tệp tiến độ có cấu trúc không hợp lệ.");
    }
    return { ...progress, quizCorrect: progress.quizCorrect ?? 0 };
}

function saveProgress(progress) {
    mkdirSync(dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(progress, null, 2)}\n`);
    renameSync(temporaryFile, dataFile);
}

app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use(cors({ origin: clientOrigins }));
app.use(express.json({ limit: "16kb" }));
app.use(express.static(distDirectory));

app.get("/api/content", (_req, res) =>
    res.json({
        lessons,
        timeline,
        quiz: { question: quiz.question, options: quiz.options },
    }),
);

app.get("/api/progress", (_req, res) => {
    const progress = readProgress();
    res.json({
        lessonsCompleted: progress.completedLessonIds.length,
        lessonsTotal: lessons.length,
        quizzesCompleted: progress.quizzesCompleted,
        averageScore: progress.quizzesCompleted
            ? Math.round(
                  (progress.quizCorrect / progress.quizzesCompleted) * 100,
              )
            : null,
        streakDays: null,
        completedLessonIds: progress.completedLessonIds,
    });
});

app.post("/api/progress/lessons/:lessonId", (req, res) => {
    if (!lessons.some((lesson) => lesson.id === req.params.lessonId)) {
        return res.status(404).json({ error: "Không tìm thấy bài học." });
    }
    const progress = readProgress();
    if (!progress.completedLessonIds.includes(req.params.lessonId)) {
        progress.completedLessonIds.push(req.params.lessonId);
        saveProgress(progress);
    }
    return res.json({
        lessonsCompleted: progress.completedLessonIds.length,
        completedLessonIds: progress.completedLessonIds,
    });
});

app.post("/api/progress/quiz", (req, res) => {
    const { selectedOption } = req.body ?? {};
    if (
        !Number.isInteger(selectedOption) ||
        selectedOption < 0 ||
        selectedOption >= quiz.options.length
    ) {
        return res
            .status(400)
            .json({ error: "Lựa chọn trả lời không hợp lệ." });
    }
    const progress = readProgress();
    progress.quizzesCompleted += 1;
    const correct = selectedOption === quiz.answer;
    if (correct) progress.quizCorrect += 1;
    saveProgress(progress);
    return res.json({
        correct,
        quizzesCompleted: progress.quizzesCompleted,
        averageScore: Math.round(
            (progress.quizCorrect / progress.quizzesCompleted) * 100,
        ),
    });
});

const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

app.post(
    "/api/ai/chat",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            error: "Bạn đã gửi quá nhiều câu hỏi. Vui lòng thử lại sau.",
        },
    }),
    async (req, res) => {
        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";
        if (!message)
            return res.status(400).json({ error: "Vui lòng nhập câu hỏi." });
        if (message.length > 2000)
            return res
                .status(400)
                .json({ error: "Câu hỏi không được dài quá 2000 ký tự." });
        if (!ai)
            return res
                .status(503)
                .json({ error: "AI chưa được cấu hình ở backend." });

        try {
            const response = await ai.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: message,
            });
            if (!response.text)
                return res
                    .status(502)
                    .json({ error: "Dịch vụ AI không trả về nội dung." });
            return res.json({ success: true, answer: response.text });
        } catch (error) {
            console.error("Lỗi gọi Gemini:", error);
            return res
                .status(502)
                .json({
                    success: false,
                    error: "Không thể kết nối dịch vụ AI.",
                });
        }
    },
);

app.use((error, _req, res, _next) => {
    console.error("Lỗi API:", error);
    const status =
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status < 500
            ? error.status
            : 500;
    return res
        .status(status)
        .json({
            error:
                status === 500
                    ? "Máy chủ không thể xử lý yêu cầu."
                    : error.message,
        });
});

app.listen(port, () =>
    console.log(`MathHistory API đang chạy tại http://localhost:${port}`),
);
