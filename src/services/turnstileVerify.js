import { HttpError } from "./accountAuth.js";

export async function verifyTurnstileToken(
    token,
    {
        secretKey = process.env.TURNSTILE_SECRET_KEY,
        fetchImpl = fetch,
        expectedHostname,
    } = {},
) {
    if (!secretKey) {
        throw new HttpError(
            503,
            "Chưa cấu hình TURNSTILE_SECRET_KEY ở backend nên chưa thể đăng ký.",
        );
    }
    if (typeof token !== "string" || !token.trim() || token.length > 2048) {
        throw new HttpError(400, "Vui lòng hoàn thành xác thực CAPTCHA.");
    }

    let response;
    try {
        response = await fetchImpl(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    secret: secretKey,
                    response: token,
                }),
                signal: AbortSignal.timeout(8000),
            },
        );
    } catch (error) {
        console.error(
            "Turnstile verification request failed:",
            error instanceof Error ? error.message : error,
        );
        throw new HttpError(
            502,
            "Không thể kết nối dịch vụ CAPTCHA. Hãy thử lại sau.",
        );
    }

    if (!response.ok) {
        throw new HttpError(
            502,
            "Dịch vụ CAPTCHA đang gặp sự cố. Hãy thử lại sau.",
        );
    }

    let result;
    try {
        result = await response.json();
    } catch {
        throw new HttpError(502, "Dịch vụ CAPTCHA trả về kết quả không hợp lệ.");
    }
    if (
        result?.success !== true ||
        result?.action !== "register" ||
        !expectedHostname ||
        result?.hostname !== expectedHostname
    ) {
        throw new HttpError(
            400,
            "Xác thực CAPTCHA chưa thành công hoặc đã hết hạn. Hãy xác thực lại.",
        );
    }
}
