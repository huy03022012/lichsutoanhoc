import { createHmac } from "node:crypto";
import { HttpError } from "./accountAuth.js";

const WINDOW_SECONDS = 15 * 60;

function getClientIp(req) {
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) return realIp.trim();

    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }
    return req.socket?.remoteAddress || "unknown";
}

function createBucketKey(type, value) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
        throw new HttpError(
            503,
            "Hệ thống giới hạn đăng nhập chưa được cấu hình.",
        );
    }
    return createHmac("sha256", secret)
        .update(`${type}:${value}`)
        .digest("hex");
}

export async function enforceLoginRateLimit({
    db,
    req,
    res,
    type,
    value,
    maxAttempts,
}) {
    const bucketKey = createBucketKey(
        type,
        type === "ip" ? getClientIp(req) : value,
    );
    const { data: retryAfter, error } = await db.rpc(
        "consume_account_login_rate_limit",
        {
            p_bucket_keys: [bucketKey],
            p_limits: [maxAttempts],
            p_window_seconds: WINDOW_SECONDS,
        },
    );
    if (error) throw error;
    if (Number.isInteger(retryAfter) && retryAfter > 0) {
        res.setHeader("Retry-After", String(retryAfter));
        throw new HttpError(
            429,
            "Bạn đã thử đăng nhập quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
        );
    }
}
