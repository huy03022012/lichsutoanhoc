import { createHash } from "node:crypto";
import {
    clearSessionCookie,
    createSession,
    ensureSameOrigin,
    getCookieValue,
    getDatabase,
    getSessionUser,
    hashPassword,
    HttpError,
    normalizeLoginUsername,
    publicUser,
    sendApiError,
    validateDisplayName,
    validatePassword,
    validateUsername,
    verifyPassword,
} from "../src/services/accountAuth.js";

const DUMMY_PASSWORD_HASH =
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (req.method === "GET") {
            const db = getDatabase();
            try {
                const user = await getSessionUser(db, req);
                return res.status(200).json({ user: user ? publicUser(user) : null });
            } catch (error) {
                if (error instanceof HttpError && error.status === 423) {
                    clearSessionCookie(req, res);
                    return res.status(200).json({ user: null, notice: error.message });
                }
                if (error instanceof HttpError && error.status === 401) {
                    return res.status(200).json({ user: null });
                }
                throw error;
            }
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
        }
        ensureSameOrigin(req);
        const db = getDatabase();
        const action = req.body?.action;

        if (action === "logout") {
            const token = getCookieValue(req);
            if (token) {
                const tokenHash = createHash("sha256").update(token).digest("hex");
                const { error } = await db
                    .from("account_sessions")
                    .delete()
                    .eq("token_hash", tokenHash);
                if (error) throw error;
            }
            clearSessionCookie(req, res);
            return res.status(200).json({ user: null });
        }

        if (action === "change-password") {
            const currentUser = await getSessionUser(db, req);
            if (!currentUser) {
                throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
            }
            const currentPassword = validatePassword(req.body?.currentPassword);
            const newPassword = validatePassword(req.body?.newPassword);
            if (
                typeof req.body?.passwordConfirmation !== "string" ||
                req.body.passwordConfirmation !== newPassword
            ) {
                throw new HttpError(400, "Mật khẩu mới nhập lại chưa khớp.");
            }

            const { data: account, error: accountError } = await db
                .from("account_users")
                .select("password_hash")
                .eq("id", currentUser.id)
                .single();
            if (accountError) throw accountError;

            if (!(await verifyPassword(currentPassword, account.password_hash))) {
                throw new HttpError(400, "Mật khẩu hiện tại chưa đúng.");
            }
            if (await verifyPassword(newPassword, account.password_hash)) {
                throw new HttpError(
                    400,
                    "Mật khẩu mới phải khác mật khẩu hiện tại.",
                );
            }

            const passwordHash = await hashPassword(newPassword);
            const { error: updateError } = await db
                .from("account_users")
                .update({ password_hash: passwordHash })
                .eq("id", currentUser.id);
            if (updateError) throw updateError;

            return res.status(200).json({ success: true });
        }

        if (action === "register") {
            const username = validateUsername(req.body?.username);
            const displayName = validateDisplayName(req.body?.displayName);
            const password = validatePassword(req.body?.password);
            if (
                typeof req.body?.passwordConfirmation !== "string" ||
                req.body.passwordConfirmation !== password
            ) {
                throw new HttpError(400, "Mật khẩu nhập lại chưa khớp.");
            }
            const passwordHash = await hashPassword(password);
            const { data: user, error } = await db
                .from("account_users")
                .insert({
                    username,
                    display_name: displayName,
                    password_hash: passwordHash,
                    role: "student",
                    is_locked: false,
                })
                .select(
                    "id, username, display_name, role, is_locked, is_root_admin, created_at",
                )
                .single();
            if (error?.code === "23505") {
                throw new HttpError(409, "Tên đăng nhập đã được sử dụng.");
            }
            if (error) throw error;
            await createSession(db, req, res, user.id);
            return res.status(201).json({ user: publicUser(user) });
        }

        if (action === "login") {
            const username = normalizeLoginUsername(req.body?.username);
            const password = validatePassword(req.body?.password);
            const { data: user, error } = await db
                .from("account_users")
                .select(
                    "id, username, display_name, password_hash, role, is_locked, is_root_admin, created_at",
                )
                .eq("username", username)
                .maybeSingle();
            if (error) throw error;
            const passwordMatches = await verifyPassword(
                password,
                user?.password_hash ?? DUMMY_PASSWORD_HASH,
            );
            if (!user || !passwordMatches) {
                throw new HttpError(401, "Tên tài khoản hoặc mật khẩu chưa đúng.");
            }
            if (user.is_locked) {
                throw new HttpError(423, "Tài khoản đã bị khóa. Hãy liên hệ quản trị viên.");
            }
            await createSession(db, req, res, user.id);
            return res.status(200).json({ user: publicUser(user) });
        }

        throw new HttpError(400, "Yêu cầu đăng nhập không hợp lệ.");
    } catch (error) {
        return sendApiError(res, error, "Lỗi API tài khoản:");
    }
}
