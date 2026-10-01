import { createHash } from "node:crypto";

// Giới hạn 20 yêu cầu / 15 phút cho mỗi địa chỉ IP.
const limit = 20;
const windowSeconds = 15 * 60;
// Bộ nhớ tiến trình chỉ là phương án local; Vercel scale nhiều instance nên dùng Redis.
const localWindows = new Map();
// Redis tăng bộ đếm và đặt thời hạn trong một lệnh nguyên tử để tránh đua dữ liệu.
const incrementScript =
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n";

function getClientKey(req) {
    // Băm IP để không lưu địa chỉ IP thô trong Redis.
    const forwardedFor = req.headers["x-forwarded-for"];
    const address =
        (typeof forwardedFor === "string" ? forwardedFor.split(",")[0] : "") ||
        req.socket?.remoteAddress ||
        "unknown";
    return createHash("sha256").update(address.trim()).digest("hex");
}

function consumeLocalWindow(key, now) {
    let window = localWindows.get(key);
    if (!window || window.resetAt <= now) {
        window = {
            count: 0,
            resetAt: (Math.floor(now / (windowSeconds * 1000)) + 1) * windowSeconds * 1000,
        };
    }
    window.count += 1;
    localWindows.set(key, window);

    if (localWindows.size > 1000) {
        for (const [storedKey, storedWindow] of localWindows) {
            if (storedWindow.resetAt <= now) localWindows.delete(storedKey);
        }
    }

    return {
        count: window.count,
        allowed: window.count <= limit,
        retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
}

async function consumeSharedWindow(key, now) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const bucket = Math.floor(now / (windowSeconds * 1000));
    const resetAt = (bucket + 1) * windowSeconds * 1000;
    const redisKey = `ai-rate-limit:${key}:${bucket}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify([
            "EVAL",
            incrementScript,
            "1",
            redisKey,
            String(windowSeconds + 1),
        ]),
    });
    if (!response.ok) {
        throw new Error(`Upstash Redis returned HTTP ${response.status}`);
    }
    const result = await response.json();
    const count = result.result;
    if (!Number.isInteger(count)) {
        throw new Error("Upstash Redis returned an invalid rate-limit result.");
    }

    return {
        count,
        allowed: count <= limit,
        retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
}

export async function checkAiRateLimit(req) {
    const key = getClientKey(req);
    const now = Date.now();
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url || token) {
        // Không âm thầm dùng bộ đếm local khi cấu hình Redis mới chỉ có một nửa.
        if (!url || !token) {
            throw new Error(
                "Cần cấu hình đồng thời UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN.",
            );
        }
        return consumeSharedWindow(key, now);
    }

    return consumeLocalWindow(key, now);
}

export const AI_RATE_LIMIT = limit;
export const AI_RATE_WINDOW_SECONDS = windowSeconds;
