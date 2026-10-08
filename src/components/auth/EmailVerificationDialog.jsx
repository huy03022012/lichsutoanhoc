import { useEffect, useRef, useState } from "react";
import { submitAccountAction } from "../../services/api.js";
import { loadTurnstile } from "../../services/turnstileClient.js";

export default function EmailVerificationDialog({
    user,
    onClose,
    onVerified,
}) {
    const [email, setEmail] = useState(user.email ?? "");
    const [code, setCode] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const [captchaError, setCaptchaError] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const captchaContainerRef = useRef(null);
    const captchaWidgetIdRef = useRef(null);
    const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

    useEffect(() => {
        setCaptchaToken("");
        setCaptchaError("");
        if (codeSent) return undefined;
        if (!captchaSiteKey) {
            setCaptchaError("Chưa cấu hình CAPTCHA cho giao diện.");
            return undefined;
        }

        let active = true;
        loadTurnstile()
            .then((turnstile) => {
                if (!active || !captchaContainerRef.current) return;
                captchaWidgetIdRef.current = turnstile.render(
                    captchaContainerRef.current,
                    {
                        sitekey: captchaSiteKey,
                        action: "email-update",
                        callback: (token) => {
                            setCaptchaToken(token);
                            setCaptchaError("");
                            setError("");
                        },
                        "expired-callback": () => {
                            setCaptchaToken("");
                            setCaptchaError(
                                "CAPTCHA đã hết hạn. Hãy xác thực lại.",
                            );
                        },
                        "error-callback": () => {
                            setCaptchaToken("");
                            setCaptchaError(
                                "Không tải được CAPTCHA. Hãy kiểm tra kết nối và thử lại.",
                            );
                        },
                    },
                );
            })
            .catch((loadError) => {
                if (active) setCaptchaError(loadError.message);
            });

        return () => {
            active = false;
            if (
                captchaWidgetIdRef.current !== null &&
                window.turnstile
            ) {
                window.turnstile.remove(captchaWidgetIdRef.current);
                captchaWidgetIdRef.current = null;
            }
        };
    }, [captchaSiteKey, codeSent]);

    async function submit(event) {
        event.preventDefault();
        setLoading(true);
        setError("");
        setMessage("");
        try {
            if (!codeSent) {
                const result = await submitAccountAction(
                    "request-email-update-code",
                    { email, captchaToken },
                );
                setMessage(result.message);
                if (!result.alreadyVerified) setCodeSent(true);
            } else {
                const result = await submitAccountAction("verify-email-update", {
                    email,
                    verificationCode: code,
                });
                onVerified(result.user);
            }
        } catch (requestError) {
            setError(requestError.message);
            if (!codeSent && captchaWidgetIdRef.current !== null) {
                setCaptchaToken("");
                window.turnstile?.reset(captchaWidgetIdRef.current);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="accountDialogBackdrop" onMouseDown={onClose}>
            <section
                className="accountDialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="emailVerificationTitle"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="accountDialogHeader">
                    <div>
                        <span className="tag">Email tài khoản</span>
                        <h2 id="emailVerificationTitle">
                            {user.emailVerified
                                ? "Cập nhật email"
                                : "Xác thực email"}
                        </h2>
                    </div>
                    <button
                        className="secondary"
                        type="button"
                        onClick={onClose}
                        aria-label="Đóng"
                    >
                        ×
                    </button>
                </div>
                <form className="accountForm" onSubmit={submit}>
                    <label>
                        Địa chỉ email
                        <input
                            autoComplete="email"
                            maxLength={254}
                            type="email"
                            required
                            value={email}
                            readOnly={codeSent}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="ban@example.com"
                        />
                    </label>
                    {codeSent && (
                        <label>
                            Mã xác thực
                            <input
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                required
                                value={code}
                                onChange={(event) =>
                                    setCode(
                                        event.target.value
                                            .replace(/\D/gu, "")
                                            .slice(0, 6),
                                    )
                                }
                                placeholder="Nhập mã 6 chữ số"
                            />
                            <span className="accountFieldHint">
                                Mã có hiệu lực trong 10 phút.
                            </span>
                        </label>
                    )}
                    {!codeSent && (
                        <div className="captchaField">
                            <div ref={captchaContainerRef} />
                            {captchaError && (
                                <p className="error" role="alert">
                                    {captchaError}
                                </p>
                            )}
                        </div>
                    )}
                    <p className="muted accountHint">
                        Mã xác nhận email trước khi liên kết với tài khoản. Sau
                        đó, bạn có thể tự đặt lại mật khẩu qua email.
                    </p>
                    {message && (
                        <p className="successMessage" role="status">
                            {message}
                        </p>
                    )}
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                    <button
                        className="primary accountSubmit"
                        disabled={
                            loading ||
                            (!codeSent && (!captchaToken || !captchaSiteKey))
                        }
                    >
                        {loading
                            ? "Đang xử lý…"
                            : codeSent
                              ? "Xác thực và lưu email"
                              : "Gửi mã xác thực"}
                    </button>
                </form>
                {codeSent && (
                    <button
                        className="textButton resendCodeButton"
                        type="button"
                        onClick={() => {
                            setCodeSent(false);
                            setCode("");
                            setMessage(
                                "Xác thực CAPTCHA để gửi lại mã hoặc đổi email.",
                            );
                        }}
                    >
                        Gửi lại mã hoặc đổi email
                    </button>
                )}
            </section>
        </div>
    );
}
