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
    validateEmail,
    validatePassword,
    validateUsername,
    verifyPassword,
} from "../src/services/accountAuth.js";
import { verifyTurnstileToken } from "../src/services/turnstileVerify.js";
import {
    consumeEmailVerificationCode,
    sendEmailVerificationCode,
} from "../src/services/emailVerification.js";
import {
    checkLoginLockout,
    recordLoginFailure,
    resetLoginFailures,
} from "../src/services/loginRateLimit.js";

// Handler tập trung cho phiên đăng nhập và các luồng tài khoản; mọi nhánh lỗi đi
// qua sendApiError để chỉ thông báo an toàn được trả về client.
const DUMMY_PASSWORD_HASH =
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function getRequestHostname(req) {
    // Turnstile phải khớp hostname của request thực tế; chỉ lấy một host từ
    // forwarded header vì proxy có thể nối nhiều giá trị trong chuỗi.
    const forwardedHost = req.headers["x-forwarded-host"];
    const requestHost =
        (typeof forwardedHost === "string" ? forwardedHost : req.headers.host)
            ?.split(",")[0]
            ?.trim() ?? "";
    try {
        return new URL(`http://${requestHost}`).hostname;
    } catch {
        throw new HttpError(400, "Tên miền yêu cầu không hợp lệ.");
    }
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (req.method === "GET") {
            // GET chỉ đọc trạng thái phiên: tài khoản chưa đăng nhập trả user=null,
            // còn phiên bị khóa sẽ bị thu hồi cookie thay vì coi là lỗi giao diện.
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

        if (action === "request-registration-code") {
            // Trước khi gửi email, xác minh CAPTCHA và kiểm tra trùng lặp để hạn
            // chế lạm dụng SMTP và tránh gửi mã cho dữ liệu không thể đăng ký.
            const username = validateUsername(req.body?.username);
            const displayName = validateDisplayName(req.body?.displayName);
            const email = validateEmail(req.body?.email);
            const password = validatePassword(req.body?.password);
            if (
                typeof req.body?.passwordConfirmation !== "string" ||
                req.body.passwordConfirmation !== password
            ) {
                throw new HttpError(400, "Mật khẩu nhập lại chưa khớp.");
            }
            await verifyTurnstileToken(req.body?.captchaToken, {
                expectedHostname: getRequestHostname(req),
                expectedAction: "register",
            });
            const { data: existingUsername, error: usernameError } = await db
                .from("account_users")
                .select("id")
                .eq("username", username)
                .maybeSingle();
            if (usernameError) throw usernameError;
            if (existingUsername) {
                throw new HttpError(409, "Tên đăng nhập đã được sử dụng.");
            }
            const { data: existingEmail, error: emailError } = await db
                .from("account_users")
                .select("id")
                .eq("email", email)
                .maybeSingle();
            if (emailError) throw emailError;
            if (existingEmail) {
                throw new HttpError(409, "Email này đã được liên kết với tài khoản.");
            }
            await sendEmailVerificationCode({
                db,
                email,
                purpose: "registration",
                subject: username,
                displayName,
            });
            return res.status(200).json({ success: true });
        }

        if (action === "register") {
            const username = validateUsername(req.body?.username);
            const displayName = validateDisplayName(req.body?.displayName);
            const email = validateEmail(req.body?.email);
            const password = validatePassword(req.body?.password);
            if (
                typeof req.body?.passwordConfirmation !== "string" ||
                req.body.passwordConfirmation !== password
            ) {
                throw new HttpError(400, "Mật khẩu nhập lại chưa khớp.");
            }
            const { data: existingUsername, error: usernameError } = await db
                .from("account_users")
                .select("id")
                .eq("username", username)
                .maybeSingle();
            if (usernameError) throw usernameError;
            if (existingUsername) {
                throw new HttpError(409, "Tên đăng nhập đã được sử dụng.");
            }
            const { data: existingEmail, error: emailError } = await db
                .from("account_users")
                .select("id")
                .eq("email", email)
                .maybeSingle();
            if (emailError) throw emailError;
            if (existingEmail) {
                throw new HttpError(409, "Email này đã được liên kết với tài khoản.");
            }
            const codeIsValid = await consumeEmailVerificationCode({
                db,
                email,
                purpose: "registration",
                subject: username,
                code: req.body?.verificationCode,
            });
            if (!codeIsValid) {
                throw new HttpError(
                    400,
                    "Mã xác thực không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới.",
                );
            }
            const passwordHash = await hashPassword(password);
            const { data: user, error } = await db
                .from("account_users")
                .insert({
                    username,
                    display_name: displayName,
                    email,
                    email_verified_at: new Date().toISOString(),
                    password_hash: passwordHash,
                    role: "student",
                    is_locked: false,
                })
                .select(
                    "id, username, display_name, email, email_verified_at, role, is_locked, is_root_admin, created_at",
                )
                .single();
            if (error?.code === "23505") {
                throw new HttpError(409, "Tên đăng nhập đã được sử dụng.");
            }
            if (error) throw error;
            await createSession(db, req, res, user.id);
            return res.status(201).json({ user: publicUser(user) });
        }

        if (action === "request-email-update-code") {
            const currentUser = await getSessionUser(db, req);
            if (!currentUser) {
                throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
            }
            const email = validateEmail(req.body?.email);
            if (
                currentUser.email === email &&
                currentUser.email_verified_at
            ) {
                return res.status(200).json({
                    success: true,
                    alreadyVerified: true,
                    message: "Email này đã được xác thực cho tài khoản.",
                });
            }
            await verifyTurnstileToken(req.body?.captchaToken, {
                expectedHostname: getRequestHostname(req),
                expectedAction: "email-update",
            });
            const { data: existingEmail, error: emailError } = await db
                .from("account_users")
                .select("id")
                .eq("email", email)
                .maybeSingle();
            if (emailError) throw emailError;
            if (existingEmail && existingEmail.id !== currentUser.id) {
                throw new HttpError(
                    409,
                    "Email này đã được liên kết với tài khoản khác.",
                );
            }
            await sendEmailVerificationCode({
                db,
                email,
                purpose: "email_update",
                subject: currentUser.id,
                displayName: currentUser.display_name,
            });
            return res.status(200).json({
                success: true,
                message: "Mã xác thực đã được gửi. Hãy kiểm tra hộp thư và thư rác.",
            });
        }

        if (action === "verify-email-update") {
            const currentUser = await getSessionUser(db, req);
            if (!currentUser) {
                throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
            }
            const email = validateEmail(req.body?.email);
            const codeIsValid = await consumeEmailVerificationCode({
                db,
                email,
                purpose: "email_update",
                subject: currentUser.id,
                code: req.body?.verificationCode,
            });
            if (!codeIsValid) {
                throw new HttpError(
                    400,
                    "Mã xác thực không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới.",
                );
            }
            const { data: updatedUser, error: updateError } = await db
                .from("account_users")
                .update({
                    email,
                    email_verified_at: new Date().toISOString(),
                })
                .eq("id", currentUser.id)
                .select(
                    "id, username, display_name, email, email_verified_at, role, is_locked, is_root_admin, created_at",
                )
                .single();
            if (updateError?.code === "23505") {
                throw new HttpError(
                    409,
                    "Email này đã được liên kết với tài khoản khác.",
                );
            }
            if (updateError) throw updateError;
            return res.status(200).json({ user: publicUser(updatedUser) });
        }

        if (action === "request-password-reset") {
            // Phản hồi luôn giống nhau bất kể email có tồn tại hay không, tránh
            // tiết lộ danh sách tài khoản đã đăng ký.
            const email = validateEmail(req.body?.email);
            await verifyTurnstileToken(req.body?.captchaToken, {
                expectedHostname: getRequestHostname(req),
                expectedAction: "password-reset",
            });
            const { data: user, error } = await db
                .from("account_users")
                .select("id, display_name")
                .eq("email", email)
                .not("email_verified_at", "is", null)
                .maybeSingle();
            if (error) throw error;
            if (user) {
                await sendEmailVerificationCode({
                    db,
                    email,
                    purpose: "password_reset",
                    subject: user.id,
                    displayName: user.display_name,
                });
            }
            return res.status(200).json({
                success: true,
                message:
                    "Nếu email đã được xác thực, mã đặt lại mật khẩu sẽ được gửi đến hộp thư.",
            });
        }

        if (action === "reset-password") {
            const email = validateEmail(req.body?.email);
            const newPassword = validatePassword(req.body?.newPassword);
            if (
                typeof req.body?.passwordConfirmation !== "string" ||
                req.body.passwordConfirmation !== newPassword
            ) {
                throw new HttpError(400, "Mật khẩu mới nhập lại chưa khớp.");
            }
            const { data: user, error } = await db
                .from("account_users")
                .select("id")
                .eq("email", email)
                .not("email_verified_at", "is", null)
                .maybeSingle();
            if (error) throw error;
            if (
                !user ||
                !(await consumeEmailVerificationCode({
                    db,
                    email,
                    purpose: "password_reset",
                    subject: user.id,
                    code: req.body?.verificationCode,
                }))
            ) {
                throw new HttpError(
                    400,
                    "Mã xác thực không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới.",
                );
            }
            const passwordHash = await hashPassword(newPassword);
            const { error: updateError } = await db
                .from("account_users")
                .update({ password_hash: passwordHash })
                .eq("id", user.id);
            if (updateError) throw updateError;
            const { error: sessionsError } = await db
                .from("account_sessions")
                .delete()
                .eq("user_id", user.id);
            if (sessionsError) throw sessionsError;
            return res.status(200).json({
                success: true,
                message: "Đặt lại mật khẩu thành công. Hãy đăng nhập lại.",
            });
        }

        if (action === "login") {
            // CAPTCHA và lockout được kiểm tra trước truy vấn thông tin người dùng;
            // hash giả bên dưới giữ chi phí xác minh gần giống khi username không tồn tại.
            const username = normalizeLoginUsername(req.body?.username);
            const password = validatePassword(req.body?.password);
            await verifyTurnstileToken(req.body?.captchaToken, {
                expectedHostname: getRequestHostname(req),
                expectedAction: "login",
            });
            await checkLoginLockout({
                db,
                username,
                res,
            });
            const { data: user, error } = await db
                .from("account_users")
                .select(
                    "id, username, display_name, email, email_verified_at, password_hash, role, is_locked, is_root_admin, created_at",
                )
                .eq("username", username)
                .maybeSingle();
            if (error) throw error;
            const passwordMatches = await verifyPassword(
                password,
                user?.password_hash ?? DUMMY_PASSWORD_HASH,
            );
            if (!user || !passwordMatches) {
                await recordLoginFailure({ db, username, res });
                throw new HttpError(401, "Tên tài khoản hoặc mật khẩu chưa đúng.");
            }
            if (user.is_locked) {
                throw new HttpError(423, "Tài khoản đã bị khóa. Hãy liên hệ quản trị viên.");
            }
            await resetLoginFailures({ db, username });
            await createSession(db, req, res, user.id);
            return res.status(200).json({ user: publicUser(user) });
        }

        throw new HttpError(400, "Yêu cầu đăng nhập không hợp lệ.");
    } catch (error) {
        return sendApiError(res, error, "Lỗi API tài khoản:");
    }
}
