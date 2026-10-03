import { createHmac } from "node:crypto";
import { HttpError } from "./accountAuth.js";

const MAX_FAILED_ATTEMPTS = 10;

function createUsernameBucketKey(username) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
        throw new HttpError(
            503,
            "Hệ thống giới hạn đăng nhập chưa được cấu hình.",
        );
    }
    return createHmac("sha256", secret)
        .update(`username:${username}`)
        .digest("hex");
}

function throwRateLimit(retryAfter, res) {
    if (!Number.isInteger(retryAfter) || retryAfter <= 0) return;
    res.setHeader("Retry-After", String(retryAfter));
    throw new HttpError(
        429,
        "Bạn đã nhập sai mật khẩu quá nhiều lần. Hãy đợi trước khi thử lại.",
    );
}

export async function checkLoginLockout({ db, username, res }) {
    const { data: retryAfter, error } = await db.rpc(
        "check_account_login_lockout",
        { p_bucket_key: createUsernameBucketKey(username) },
    );
    if (error) throw error;
    throwRateLimit(retryAfter, res);
}

export async function recordLoginFailure({ db, username, res }) {
    const { data: retryAfter, error } = await db.rpc(
        "record_account_login_failure",
        {
            p_bucket_key: createUsernameBucketKey(username),
            p_max_attempts: MAX_FAILED_ATTEMPTS,
        },
    );
    if (error) throw error;
    throwRateLimit(retryAfter, res);
}

export async function resetLoginFailures({ db, username }) {
    const { error } = await db.rpc("reset_account_login_failures", {
        p_bucket_key: createUsernameBucketKey(username),
    });
    if (error) throw error;
}
