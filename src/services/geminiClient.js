import { GoogleGenAI } from "@google/genai";

const clients = new Map();
let nextKeyIndex = 0;

/**
 * Tập hợp khóa Gemini từ môi trường backend.
 * GEMINI_API_KEY giữ tương thích với cấu hình hiện tại; GEMINI_API_KEYS nhận
 * thêm nhiều khóa, phân tách bằng dấu phẩy hoặc xuống dòng.
 */
export function getGeminiApiKeys(env = process.env) {
    const configuredKeys = [
        env.GEMINI_API_KEY || "",
        env.GEMINI_API_KEYS || "",
    ];
    return [
        ...new Set(
            configuredKeys
                .flatMap((value) => value.split(/[,\r\n]+/))
                .map((key) => key.trim())
                .filter(Boolean),
        ),
    ];
}

function getGeminiClient(apiKey) {
    if (!clients.has(apiKey)) {
        clients.set(apiKey, new GoogleGenAI({ apiKey }));
    }
    return clients.get(apiKey);
}

export function isGeminiQuotaError(error) {
    const status = Number(error?.status ?? error?.statusCode ?? error?.code);
    const details = [
        error?.message,
        error?.status,
        error?.statusText,
        error?.error?.status,
        error?.error?.message,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        status === 429 ||
        /RESOURCE_EXHAUSTED|quota(?:\s|_|-)*(?:exceeded|limit)|rate(?:\s|_|-)*limit/i.test(
            details,
        )
    );
}

/**
 * Thử lần lượt các khóa khi Google báo hết quota/rate limit.
 * Lỗi cấu hình, quyền truy cập hoặc request không hợp lệ được trả về ngay,
 * tránh che khuất nguyên nhân thật bằng cách đổi khóa không cần thiết.
 */
export async function generateGeminiContent(
    request,
    { apiKeys = getGeminiApiKeys(), getClient = getGeminiClient } = {},
) {
    if (apiKeys.length === 0) {
        throw new Error("Chưa cấu hình khóa Gemini ở backend.");
    }

    const startIndex = nextKeyIndex % apiKeys.length;
    let lastQuotaError;

    for (let offset = 0; offset < apiKeys.length; offset += 1) {
        const keyIndex = (startIndex + offset) % apiKeys.length;
        try {
            const response = await getClient(apiKeys[keyIndex])
                .models.generateContent(request);
            nextKeyIndex = keyIndex;
            return response;
        } catch (error) {
            if (!isGeminiQuotaError(error)) {
                throw error;
            }
            lastQuotaError = error;
        }
    }

    throw lastQuotaError;
}
