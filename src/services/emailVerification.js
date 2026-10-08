import { createHmac, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { HttpError } from "./accountAuth.js";

function hashValue(value) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
        throw new HttpError(
            503,
            "Hệ thống xác thực email chưa được cấu hình ở máy chủ.",
        );
    }
    return createHmac("sha256", secret).update(value).digest("hex");
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/gu, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };
        return entities[character];
    });
}

export async function sendEmailVerificationCode({
    db,
    email,
    purpose,
    subject,
    displayName,
}) {
    const gmailUser = process.env.GMAIL_USER;
    const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/gu, "");
    if (!gmailUser || !appPassword) {
        throw new HttpError(
            503,
            "Chưa cấu hình GMAIL_USER và GMAIL_APP_PASSWORD ở máy chủ.",
        );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const emailHash = hashValue(`email:${email}`);
    const subjectHash = hashValue(`subject:${purpose}:${subject}`);
    const codeHash = hashValue(
        `code:${purpose}:${emailHash}:${subjectHash}:${code}`,
    );
    const { data: retryAfter, error: saveError } = await db.rpc(
        "save_account_email_code",
        {
            p_purpose: purpose,
            p_email_hash: emailHash,
            p_subject_hash: subjectHash,
            p_code_hash: codeHash,
        },
    );
    if (saveError) throw saveError;
    if (Number.isInteger(retryAfter) && retryAfter > 0) {
        throw new HttpError(
            429,
            `Bạn vừa yêu cầu mã xác thực. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút.`,
        );
    }

    const purposeText = {
        registration: "xác thực tài khoản",
        password_reset: "đặt lại mật khẩu",
        email_update: "liên kết địa chỉ email",
    }[purpose];
    const safeName = escapeHtml(displayName || "bạn");
    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: gmailUser,
                pass: appPassword,
            },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 10000,
        });
        await transporter.sendMail({
            from: {
                name: "MathHistory AI",
                address: gmailUser,
            },
            to: email,
            subject: `Mã ${purposeText} MathHistory AI`,
            text: `Xin chào ${displayName || "bạn"}, mã ${purposeText} của bạn là ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.`,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172b3a"><h2>MathHistory AI</h2><p>Xin chào ${safeName},</p><p>Mã ${purposeText} của bạn:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p></div>`,
        });
    } catch (error) {
        console.error(
            "Email verification delivery failed:",
            error instanceof Error ? error.message : error,
        );
        throw new HttpError(
            502,
            "Không gửi được email xác thực. Hãy thử lại sau.",
        );
    }
}

export async function consumeEmailVerificationCode({
    db,
    email,
    purpose,
    subject,
    code,
}) {
    if (typeof code !== "string" || !/^\d{6}$/u.test(code)) return false;
    const emailHash = hashValue(`email:${email}`);
    const subjectHash = hashValue(`subject:${purpose}:${subject}`);
    const codeHash = hashValue(
        `code:${purpose}:${emailHash}:${subjectHash}:${code}`,
    );
    const { data, error } = await db.rpc("consume_account_email_code", {
        p_purpose: purpose,
        p_email_hash: emailHash,
        p_subject_hash: subjectHash,
        p_code_hash: codeHash,
    });
    if (error) throw error;
    return data === true;
}
