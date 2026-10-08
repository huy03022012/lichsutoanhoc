import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "mh_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_COST = 16384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 64;

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function getDatabase() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new HttpError(
            503,
            "Hệ thống tài khoản chưa được cấu hình Supabase phía máy chủ.",
        );
    }
    return createClient(url, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });
}

export function normalizeUsername(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
}

export function validateUsername(value) {
    const username = normalizeUsername(value);
    if (
        username.length < 3 ||
        username.length > 24 ||
        !/^[a-z0-9]+$/.test(username)
    ) {
        throw new HttpError(
            400,
            "Tên đăng nhập phải viết liền không dấu, chỉ gồm chữ cái a-z và số 0-9, dài 3–24 ký tự.",
        );
    }
    return username;
}

export function normalizeLoginUsername(value) {
    if (typeof value !== "string") {
        throw new HttpError(400, "Tên đăng nhập không hợp lệ.");
    }
    const username = value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
    const length = Array.from(username).length;
    if (
        length < 3 ||
        length > 24 ||
        !/^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u.test(username)
    ) {
        throw new HttpError(400, "Tên đăng nhập không hợp lệ.");
    }
    return username;
}

export function validateDisplayName(value) {
    if (typeof value !== "string") {
        throw new HttpError(400, "Vui lòng nhập tên hiển thị.");
    }
    const displayName = value.normalize("NFC").trim().replace(/\s+/gu, " ");
    if (Array.from(displayName).length < 1 || Array.from(displayName).length > 60) {
        throw new HttpError(400, "Tên hiển thị cần dài từ 1 đến 60 ký tự.");
    }
    return displayName;
}

export function validateEmail(value) {
    if (typeof value !== "string") {
        throw new HttpError(400, "Vui lòng nhập địa chỉ email.");
    }
    const email = value.normalize("NFC").trim().toLowerCase();
    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ) {
        throw new HttpError(400, "Địa chỉ email không hợp lệ.");
    }
    return email;
}

export function validatePassword(value) {
    if (typeof value !== "string" || value.length < 8 || value.length > 128) {
        throw new HttpError(400, "Mật khẩu phải có từ 8 đến 128 ký tự.");
    }
    return value;
}

export async function hashPassword(password) {
    const salt = randomBytes(16);
    const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH, {
        N: PASSWORD_COST,
        r: PASSWORD_BLOCK_SIZE,
        p: PASSWORD_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
    });
    return [
        "scrypt",
        PASSWORD_COST,
        PASSWORD_BLOCK_SIZE,
        PASSWORD_PARALLELIZATION,
        salt.toString("base64url"),
        Buffer.from(derivedKey).toString("base64url"),
    ].join("$");
}

export async function verifyPassword(password, storedHash) {
    const [algorithm, cost, blockSize, parallelization, saltValue, keyValue] =
        String(storedHash).split("$");
    if (
        algorithm !== "scrypt" ||
        Number(cost) !== PASSWORD_COST ||
        Number(blockSize) !== PASSWORD_BLOCK_SIZE ||
        Number(parallelization) !== PASSWORD_PARALLELIZATION ||
        !saltValue ||
        !keyValue
    ) {
        throw new Error("Định dạng hash mật khẩu không hợp lệ.");
    }
    const expected = Buffer.from(keyValue, "base64url");
    const actual = Buffer.from(
        await scrypt(
            password,
            Buffer.from(saltValue, "base64url"),
            expected.length,
            {
                N: PASSWORD_COST,
                r: PASSWORD_BLOCK_SIZE,
                p: PASSWORD_PARALLELIZATION,
                maxmem: 64 * 1024 * 1024,
            },
        ),
    );
    return (
        expected.length === PASSWORD_KEY_LENGTH &&
        actual.length === expected.length &&
        timingSafeEqual(actual, expected)
    );
}

export function getCookieValue(req, name = SESSION_COOKIE) {
    const cookieHeader = req.headers.cookie;
    if (typeof cookieHeader !== "string") return null;
    for (const cookie of cookieHeader.split(";")) {
        const separator = cookie.indexOf("=");
        if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
        return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
    return null;
}

export function setSessionCookie(req, res, token) {
    const secure =
        process.env.NODE_ENV === "production" ||
        req.headers["x-forwarded-proto"] === "https";
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SECONDS}${secure ? "; Secure" : ""}`,
    );
}

export function clearSessionCookie(req, res) {
    const secure =
        process.env.NODE_ENV === "production" ||
        req.headers["x-forwarded-proto"] === "https";
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
    );
}

export function ensureSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const forwardedHost = req.headers["x-forwarded-host"];
    const host = (typeof forwardedHost === "string" ? forwardedHost : req.headers.host)
        ?.split(",")[0]
        ?.trim();
    let originHost = "";
    try {
        originHost = new URL(origin).host;
    } catch {
        throw new HttpError(403, "Nguồn yêu cầu không hợp lệ.");
    }
    if (originHost !== host && !allowedOrigins.includes(origin)) {
        throw new HttpError(403, "Yêu cầu khác nguồn bị từ chối.");
    }
}

export async function createSession(db, req, res, userId) {
    const { error: cleanupError } = await db
        .from("account_sessions")
        .delete()
        .lte("expires_at", new Date().toISOString());
    if (cleanupError) throw cleanupError;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(
        Date.now() + SESSION_LIFETIME_SECONDS * 1000,
    ).toISOString();
    const { error } = await db.from("account_sessions").insert({
        token_hash: tokenHash,
        user_id: userId,
        expires_at: expiresAt,
    });
    if (error) throw error;
    setSessionCookie(req, res, token);
}

export async function getSessionUser(db, req) {
    const token = getCookieValue(req);
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: session, error: sessionError } = await db
        .from("account_sessions")
        .select("token_hash, user_id, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return null;
    if (Date.parse(session.expires_at) <= Date.now()) {
        const { error: deleteError } = await db
            .from("account_sessions")
            .delete()
            .eq("token_hash", tokenHash);
        if (deleteError) throw deleteError;
        return null;
    }
    const { data: user, error: userError } = await db
        .from("account_users")
        .select(
            "id, username, display_name, email, email_verified_at, role, is_locked, is_root_admin, created_at",
        )
        .eq("id", session.user_id)
        .maybeSingle();
    if (userError) throw userError;
    if (!user) return null;
    if (user.is_locked) {
        const { error: deleteError } = await db
            .from("account_sessions")
            .delete()
            .eq("token_hash", tokenHash);
        if (deleteError) throw deleteError;
        throw new HttpError(423, "Tài khoản đã bị khóa.");
    }
    return user;
}

export async function requireUser(db, req) {
    const user = await getSessionUser(db, req);
    if (!user) throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
    return user;
}

export async function requireAuthenticatedRequest(req, res, context) {
    try {
        const db = getDatabase();
        const user = await requireUser(db, req);
        req.authenticatedUserId = user.id;
        req.authenticatedDisplayName = user.display_name || user.username;
        return true;
    } catch (error) {
        sendApiError(res, error, context);
        return false;
    }
}

export function requireRole(user, roles) {
    if (!roles.includes(user.role)) {
        throw new HttpError(403, "Bạn không có quyền thực hiện thao tác này.");
    }
}

export function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        email: user.email ?? null,
        emailVerified: Boolean(user.email_verified_at),
        role: user.role,
        is_locked: user.is_locked,
        is_root_admin: user.is_root_admin === true,
        createdAt: user.created_at,
    };
}

export function sendApiError(res, error, context) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) console.error(context, error);
    return res.status(status).json({
        error:
            status === 500
                ? "Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau."
                : error.message,
    });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
