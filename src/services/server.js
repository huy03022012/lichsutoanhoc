import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { lessons, quiz, timeline } from "../data/content.js";
import { buildAiSystemInstruction } from "./aiPrompt.js";
import { validateAiImage } from "./aiImage.js";
import accountHandler from "../../api/auth.js";
import managedUsersHandler from "../../api/admin/users.js";
import deletionRequestsHandler from "../../api/admin/deletion-requests.js";
import assignmentsHandler from "../../api/assignments.js";
import libraryHandler from "../../api/library.js";
import assignmentSubmissionsHandler from "../../api/assignments/[assignmentId]/submissions.js";
import {
    getDatabase,
    requireAuthenticatedRequest,
} from "./accountAuth.js";
import { loadAdditionalLibraryContent } from "./libraryContent.js";
import { consumeAiUsage, getAiUsage } from "./aiUsage.js";
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

// Express này dùng khi chạy local hoặc môi trường Node server thường.
// Vercel sử dụng các handler riêng trong thư mục api/.
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

// Đọc tiến độ từ file JSON local; lỗi dữ liệu hỏng được báo lên API, không tự reset.
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

// Ghi qua file tạm rồi đổi tên để tránh để lại JSON ghi dở nếu tiến trình bị ngắt.
function saveProgress(progress) {
    mkdirSync(dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.tmp`;
    writeFileSync(temporaryFile, `${JSON.stringify(progress, null, 2)}\n`);
    renameSync(temporaryFile, dataFile);
}

// Cấu hình middleware chung trước khi khai báo các route API.
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use(cors({ origin: clientOrigins }));
// Request chat có thể chứa ảnh base64 3 MB; giới hạn body để chống payload quá lớn.
app.use(express.json({ limit: "4.2mb" }));
app.use("/api", async (req, res, next) => {
    if (req.path === "/auth") return next();
    if (
        await requireAuthenticatedRequest(
            req,
            res,
            "Lỗi xác thực yêu cầu API:",
        )
    ) {
        return next();
    }
});
app.use(express.static(distDirectory));

// Trả nội dung dùng chung của website; không gửi đáp án quiz xuống frontend.
app.get("/api/content", async (_req, res, next) => {
    try {
        const additionalContent = await loadAdditionalLibraryContent(
            getDatabase(),
        );
        return res.json({
            lessons: [...lessons, ...additionalContent.lessons],
            timeline: [...timeline, ...additionalContent.timeline],
            librarySchemaReady: additionalContent.schemaReady,
            librarySchemaWarning: additionalContent.schemaWarning,
            quiz: { question: quiz.question, options: quiz.options },
        });
    } catch (error) {
        return next(error);
    }
});
app.post("/api/library", async (req, res) => {
    await libraryHandler(req, res);
});
app.get("/api/ai/chat", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
        const usage = await getAiUsage(getDatabase(), req.authenticatedUserId);
        return res.json({ usage });
    } catch (error) {
        return next(error);
    }
});

// Đọc thống kê từ file tiến độ hiện tại trên máy chủ local.
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

// Đánh dấu một bài hợp lệ là hoàn thành, không ghi trùng ID.
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

// Chấm quiz ở backend để đáp án đúng không cần gửi cho trình duyệt.
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

app.all("/api/auth", accountHandler);
app.all("/api/admin/users", managedUsersHandler);
app.all("/api/admin/deletion-requests", deletionRequestsHandler);
app.all("/api/assignments", assignmentsHandler);
app.all("/api/library", libraryHandler);
app.all(
    "/api/assignments/:assignmentId/submissions",
    assignmentSubmissionsHandler,
);

// Chỉ backend mới đọc biến khóa Gemini; không dùng tiền tố VITE_.
const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

app.post("/api/ai/chat", async (req, res) => {
        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";
        const image = req.body?.image ?? null;
        const checkWork = req.body?.checkWork === true;
        if (!message && !image)
            return res
                .status(400)
                .json({ error: "Hãy nhập câu hỏi hoặc gửi ảnh bài tập." });
        if (message.length > 2000)
            return res
                .status(400)
                .json({ error: "Câu hỏi không được dài quá 2000 ký tự." });
        const imageError = validateAiImage(image);
        if (imageError)
            return res.status(400).json({ error: imageError });
        if (!ai)
            return res
                .status(503)
                .json({ error: "AI chưa được cấu hình ở backend." });

        let usage;
        try {
            usage = await consumeAiUsage(
                getDatabase(),
                req.authenticatedUserId,
            );
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
            const parts = [];
            // Cờ riêng giúp phân biệt yêu cầu chấm bài với chế độ gợi ý mặc định.
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
                model: "gemini-3.5-flash",
                contents: [{ role: "user", parts }],
                config: {
                    systemInstruction: buildAiSystemInstruction(
                        req.authenticatedDisplayName,
                    ),
                },
            });
            if (!response.text)
                return res
                    .status(502)
                    .json({ error: "Dịch vụ AI không trả về nội dung." });
            return res.json({ success: true, answer: response.text, usage });
        } catch (error) {
            console.error("Lỗi gọi Gemini:", error);
            return res
                .status(502)
                .json({
                    success: false,
                    error: "Không thể kết nối dịch vụ AI.",
                });
        }
});

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

// Mở server local; Vercel không chạy app.listen mà gọi các hàm trong api/.
app.listen(port, () =>
    console.log(`MathHistory API đang chạy tại http://localhost:${port}`),
);
