import { createHmac } from "node:crypto";
import { HttpError } from "./accountAuth.js";

const MAX_FAILED_ATTEMPTS = 10;

// Dùng HMAC làm khóa bucket thay vì lưu tên tài khoản dưới dạng rõ trong bảng
// giới hạn đăng nhập; cùng username tạo cùng bucket để chia sẻ lịch sử thất bại.
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
    // RPC trả null/0 khi chưa khóa; chỉ khi có thời gian chờ hợp lệ mới phát 429.
    if (!Number.isInteger(retryAfter) || retryAfter <= 0) return;
    res.setHeader("Retry-After", String(retryAfter));
    throw new HttpError(
        429,
        "Bạn đã nhập sai mật khẩu quá nhiều lần. Hãy đợi trước khi thử lại.",
    );
}

export async function checkLoginLockout({ db, username, res }) {
    // Kiểm tra bucket trước khi tra cứu tài khoản để chặn các lần thử đang bị khóa.
    const { data: retryAfter, error } = await db.rpc(
        "check_account_login_lockout",
        { p_bucket_key: createUsernameBucketKey(username) },
    );
    if (error) throw error;
    throwRateLimit(retryAfter, res);
}

export async function recordLoginFailure({ db, username, res }) {
    // Cộng lỗi và quyết định khóa được thực hiện trong RPC để các lần đăng nhập
    // đồng thời không vượt qua ngưỡng do cập nhật bị mất.
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
