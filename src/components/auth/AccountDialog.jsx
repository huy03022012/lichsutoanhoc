import { useEffect, useRef, useState } from "react";
import { submitAccountAction } from "../../services/api.js";
import { loadTurnstile } from "../../services/turnstileClient.js";

export default function AccountDialog({
    onClose = () => {},
    onAuthenticated,
    required = false,
}) {
    const [mode, setMode] = useState("login");
    const [displayName, setDisplayName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirmation, setShowPasswordConfirmation] =
        useState(false);
    const [error, setError] = useState("");
    const [usernameError, setUsernameError] = useState("");
    const [loading, setLoading] = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const [captchaError, setCaptchaError] = useState("");
    const captchaContainerRef = useRef(null);
    const captchaWidgetIdRef = useRef(null);
    const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

    useEffect(() => {
        if (mode !== "register") {
            setCaptchaToken("");
            setCaptchaError("");
            return undefined;
        }
        if (!captchaSiteKey) {
            setCaptchaError("Chưa cấu hình CAPTCHA cho giao diện đăng ký.");
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
                        action: "register",
                        callback: (token) => {
                            setCaptchaToken(token);
                            setCaptchaError("");
                            setError("");
                        },
                        "expired-callback": () => {
                            setCaptchaToken("");
                            setCaptchaError("CAPTCHA đã hết hạn. Hãy xác thực lại.");
                        },
                        "error-callback": () => {
                            setCaptchaToken("");
                            setCaptchaError(
                                "Không tải được CAPTCHA. Hãy thử làm mới hoặc kiểm tra kết nối.",
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
    }, [mode, captchaSiteKey]);

    async function submit(event) {
        event.preventDefault();
        setLoading(true);
        setError("");
        setUsernameError("");
        if (mode === "register" && password !== passwordConfirmation) {
            setError("Mật khẩu nhập lại chưa khớp.");
            setLoading(false);
            return;
        }
        if (mode === "register" && !captchaToken) {
            setError("Vui lòng hoàn thành xác thực CAPTCHA.");
            setLoading(false);
            return;
        }
        try {
            const result = await submitAccountAction(mode, {
                username,
                displayName,
                password,
                passwordConfirmation,
                ...(mode === "register" ? { captchaToken } : {}),
            });
            onAuthenticated(result.user);
        } catch (requestError) {
            if (mode === "register") {
                setCaptchaToken("");
                if (
                    captchaWidgetIdRef.current !== null &&
                    window.turnstile
                ) {
                    window.turnstile.reset(captchaWidgetIdRef.current);
                }
            }
            if (
                mode === "register" &&
                requestError.message === "Tên đăng nhập đã được sử dụng."
            ) {
                setUsernameError(requestError.message);
            } else {
                setError(requestError.message);
            }
        } finally {
            setLoading(false);
        }
    }

    function switchMode(nextMode) {
        setMode(nextMode);
        setShowPassword(false);
        setShowPasswordConfirmation(false);
        setError("");
        setUsernameError("");
        setPasswordConfirmation("");
    }

    return (
        <div
            className={required ? "accountPageLayout" : "accountDialogBackdrop"}
            onMouseDown={required ? undefined : onClose}
        >
            {required && (
                <div className="accountPageIntro">
                    <span className="tag">MathHistory AI</span>
                    <h1>
                        Khám phá lịch sử Toán học
                        <br />
                        <em>bắt đầu từ đây.</em>
                    </h1>
                    <p className="muted">
                        Đăng nhập hoặc tạo tài khoản học sinh để xem học liệu,
                        làm bài tập và trò chuyện cùng AI trợ giảng.
                    </p>
                    <div className="authPageHighlights">
                        <span>Học liệu lịch sử Toán học</span>
                        <span>Bài tập và tiến độ học tập</span>
                        <span>AI trợ giảng đồng hành</span>
                    </div>
                </div>
            )}
            <section
                className={`accountDialog${required ? " accountPageCard" : ""}`}
                role={required ? undefined : "dialog"}
                aria-modal={required ? undefined : "true"}
                aria-labelledby="accountDialogTitle"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="accountDialogHeader">
                    <div>
                        <span className="tag">
                            {mode === "login" ? "Chào mừng trở lại" : "Tài khoản mới"}
                        </span>
                        <h2 id="accountDialogTitle">
                            {mode === "login" ? "Đăng nhập" : "Đăng ký học sinh"}
                        </h2>
                    </div>
                    {!required && (
                        <button
                            className="secondary"
                            type="button"
                            onClick={onClose}
                            aria-label="Đóng"
                        >
                            ×
                        </button>
                    )}
                </div>
                <div
                    className="accountModeTabs"
                    role="tablist"
                    aria-label="Chọn đăng nhập hoặc đăng ký"
                >
                    <button
                        className={mode === "login" ? "active" : ""}
                        type="button"
                        role="tab"
                        aria-selected={mode === "login"}
                        onClick={() => switchMode("login")}
                    >
                        Đăng nhập
                    </button>
                    <button
                        className={mode === "register" ? "active" : ""}
                        type="button"
                        role="tab"
                        aria-selected={mode === "register"}
                        onClick={() => switchMode("register")}
                    >
                        Tạo tài khoản
                    </button>
                </div>
                <form className="accountForm" onSubmit={submit}>
                    {mode === "register" && (
                        <label>
                            Tên hiển thị
                            <input
                                autoComplete="name"
                                maxLength={60}
                                required
                                value={displayName}
                                onChange={(event) =>
                                    setDisplayName(event.target.value)
                                }
                                placeholder="Ví dụ: Lê Hồ Hoàng Huy"
                            />
                        </label>
                    )}
                    <label>
                        Tên đăng nhập
                        <input
                            autoComplete="username"
                            minLength={3}
                            maxLength={24}
                            required
                            pattern={
                                mode === "register"
                                    ? "[A-Za-z0-9]{3,24}"
                                    : undefined
                            }
                            title={
                                mode === "register"
                                    ? "Viết liền, không dấu; chỉ dùng chữ cái a-z và số 0-9."
                                    : undefined
                            }
                            value={username}
                            autoCapitalize="none"
                            spellCheck="false"
                            aria-invalid={Boolean(usernameError)}
                            aria-describedby={[
                                mode === "register"
                                    ? "account-username-hint"
                                    : null,
                                usernameError ? "account-username-error" : null,
                            ]
                                .filter(Boolean)
                                .join(" ") || undefined}
                            onChange={(event) => {
                                setUsername(event.target.value);
                                setUsernameError("");
                                setError("");
                            }}
                            placeholder="Ví dụ: lehohoanghuy"
                        />
                        {mode === "register" && (
                            <span
                                id="account-username-hint"
                                className="accountFieldHint"
                            >
                                Lưu ý: Tên đăng nhập là chuỗi ký tự viết liền,
                                không dấu, không khoảng trắng; chỉ dùng chữ cái
                                a–z và số 0–9. Ví dụ: lehohoanghuy.
                            </span>
                        )}
                        {usernameError && (
                            <span
                                id="account-username-error"
                                className="error"
                                role="alert"
                            >
                                {usernameError}
                            </span>
                        )}
                    </label>
                    <label>
                        Mật khẩu
                        <span className="passwordInputWrap">
                            <input
                                id="account-password"
                                autoComplete={
                                    mode === "login" ? "current-password" : "new-password"
                                }
                                minLength={8}
                                maxLength={128}
                                required
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Tối thiểu 8 ký tự"
                            />
                            <button
                                className="passwordVisibilityToggle"
                                type="button"
                                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                aria-controls="account-password"
                                aria-pressed={showPassword}
                                onClick={() => setShowPassword((visible) => !visible)}
                            >
                                {showPassword ? "Ẩn" : "Hiện"}
                            </button>
                        </span>
                    </label>
                    {mode === "register" && (
                        <label>
                            Nhập lại mật khẩu
                            <span className="passwordInputWrap">
                                <input
                                    id="account-password-confirmation"
                                    autoComplete="new-password"
                                    minLength={8}
                                    maxLength={128}
                                    required
                                    type={
                                        showPasswordConfirmation
                                            ? "text"
                                            : "password"
                                    }
                                    value={passwordConfirmation}
                                    onChange={(event) => {
                                        setPasswordConfirmation(event.target.value);
                                        setError("");
                                    }}
                                    placeholder="Nhập lại mật khẩu"
                                />
                                <button
                                    className="passwordVisibilityToggle"
                                    type="button"
                                    aria-label={
                                        showPasswordConfirmation
                                            ? "Ẩn mật khẩu nhập lại"
                                            : "Hiện mật khẩu nhập lại"
                                    }
                                    aria-controls="account-password-confirmation"
                                    aria-pressed={showPasswordConfirmation}
                                    onClick={() =>
                                        setShowPasswordConfirmation((visible) => !visible)
                                    }
                                >
                                    {showPasswordConfirmation ? "Ẩn" : "Hiện"}
                                </button>
                            </span>
                        </label>
                    )}
                    {mode === "register" && (
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
                        {mode === "register"
                            ? "Tên đăng nhập dài 3–24 ký tự. Tên hiển thị có thể viết tiếng Việt. Đăng ký mới mặc định là học sinh."
                            : "Nhập tên đăng nhập và mật khẩu của bạn."}
                    </p>
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                    <button
                        className="primary accountSubmit"
                        disabled={
                            loading ||
                            (mode === "register" &&
                                (!captchaToken || !captchaSiteKey))
                        }
                    >
                        {loading
                            ? "Đang xử lý…"
                            : mode === "login"
                              ? "Đăng nhập"
                              : "Tạo tài khoản"                              }
                    </button>
                </form>
            </section>
        </div>
    );
}
