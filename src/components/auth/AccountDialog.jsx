import { useEffect, useRef, useState } from "react";
import { submitAccountAction } from "../../services/api.js";
import { loadTurnstile } from "../../services/turnstileClient.js";

// Dialog đăng nhập/đăng ký/quên mật khẩu dùng chung cho các luồng tài khoản.
// `mode` kiểm soát trạng thái UI và xác thực: đăng nhập cần CAPTCHA ngay, đăng ký
// phải validate username/displayName và gửi mã xác thực qua email, còn khôi phục mật
// khẩu chia thành 2 bước (gửi mã rồi đặt lại mật khẩu). Các lỗi tạm thời được
// xóa sau 5 giây để tránh trạng thái "đóng băng" khi người dùng sửa lại thông tin.
export default function AccountDialog({
    onClose = () => {},
    onAuthenticated,
    required = false,
}) {
    const [mode, setMode] = useState("login");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirmation, setShowPasswordConfirmation] =
        useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [usernameError, setUsernameError] = useState("");
    const [verificationCode, setVerificationCode] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const [captchaError, setCaptchaError] = useState("");
    const captchaContainerRef = useRef(null);
    const captchaWidgetIdRef = useRef(null);
    const errorTimerRef = useRef(null);
    const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    const requiresCaptcha = mode === "login" || !codeSent;

    function clearErrorTimer() {
        if (errorTimerRef.current !== null) {
            clearTimeout(errorTimerRef.current);
            errorTimerRef.current = null;
        }
    }

    function clearError() {
        clearErrorTimer();
        setError("");
    }

    function showTemporaryError(message) {
        clearErrorTimer();
        setError(message);
        errorTimerRef.current = setTimeout(() => {
            setError("");
            errorTimerRef.current = null;
        }, 5000);
    }

    // CAPTCHA được render lại theo từng `mode` để tránh sử dụng token cũ trong
    // luồng đăng ký hoặc reset mật khẩu. Khi mode đổi hoặc token hết hạn, widget
    // cũ sẽ được remove để không còn gắn vào form trước đó.
    useEffect(() => {
        setCaptchaToken("");
        setCaptchaError("");
        if (!requiresCaptcha) return undefined;
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
                        action:
                            mode === "recover"
                                ? "password-reset"
                                : mode,
                        callback: (token) => {
                            setCaptchaToken(token);
                            setCaptchaError("");
                            clearError();
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
            clearErrorTimer();
            if (
                captchaWidgetIdRef.current !== null &&
                window.turnstile
            ) {
                window.turnstile.remove(captchaWidgetIdRef.current);
                captchaWidgetIdRef.current = null;
            }
        };
    }, [mode, captchaSiteKey, requiresCaptcha]);

    // submit hợp nhất toàn bộ flow validate và gửi request: kiểm tra username,
    // đối chiếu mật khẩu, xác nhận CAPTCHA rồi gọi API tương ứng theo `mode`.
    // Nếu request thất bại, token CAPTCHA sẽ được reset để người dùng không bị mắc ở
    // trạng thái đã verify nhưng chưa có hành động tiếp theo.
    async function submit(event) {
        event.preventDefault();
        clearErrorTimer();
        setLoading(true);
        setError("");
        setSuccessMessage("");
        setUsernameError("");
        const normalizedUsername =
            mode === "register" ? username.trim().toLowerCase() : username;
        if (mode === "register" && !/^[a-z0-9]{3,24}$/u.test(normalizedUsername)) {
            setUsernameError(
                "Tên đăng nhập phải gồm 3–24 chữ cái a-z hoặc số 0-9, viết liền không dấu.",
            );
            setLoading(false);
            return;
        }
        if (
            mode === "register" &&
            (displayName.trim().length < 1 || Array.from(displayName.trim()).length > 60)
        ) {
            showTemporaryError("Tên hiển thị cần dài từ 1 đến 60 ký tự.");
            setLoading(false);
            return;
        }
        if (
            (mode === "register" || (mode === "recover" && codeSent)) &&
            password !== passwordConfirmation
        ) {
            setError(
                mode === "recover"
                    ? "Mật khẩu mới nhập lại chưa khớp."
                    : "Mật khẩu nhập lại chưa khớp.",
            );
            setLoading(false);
            return;
        }
        if (requiresCaptcha && !captchaToken) {
            setError("Vui lòng hoàn thành xác thực CAPTCHA.");
            setLoading(false);
            return;
        }
        try {
            if (mode === "login") {
                const result = await submitAccountAction("login", {
                    username,
                    password,
                    captchaToken,
                });
                onAuthenticated(result.user);
            } else if (mode === "register" && !codeSent) {
                await submitAccountAction("request-registration-code", {
                    username: normalizedUsername,
                    displayName,
                    email,
                    password,
                    passwordConfirmation,
                    captchaToken,
                });
                setCodeSent(true);
                setCaptchaToken("");
                setSuccessMessage(
                    "Mã xác thực đã được gửi nếu email hợp lệ. Kiểm tra hộp thư và thư rác.",
                );
            } else if (mode === "register") {
                const result = await submitAccountAction("register", {
                    username: normalizedUsername,
                    displayName,
                    email,
                    password,
                    passwordConfirmation,
                    verificationCode,
                });
                onAuthenticated(result.user);
            } else if (!codeSent) {
                const result = await submitAccountAction(
                    "request-password-reset",
                    { email, captchaToken },
                );
                setCodeSent(true);
                setCaptchaToken("");
                setSuccessMessage(result.message);
            } else {
                const result = await submitAccountAction("reset-password", {
                    email,
                    verificationCode,
                    newPassword: password,
                    passwordConfirmation,
                });
                setMode("login");
                setCodeSent(false);
                setVerificationCode("");
                setPassword("");
                setPasswordConfirmation("");
                setSuccessMessage(result.message);
            }
        } catch (requestError) {
            if (requiresCaptcha) setCaptchaToken("");
            if (
                requiresCaptcha &&
                captchaWidgetIdRef.current !== null &&
                window.turnstile
            ) {
                window.turnstile.reset(captchaWidgetIdRef.current);
            }
            if (
                mode === "register" &&
                requestError.message === "Tên đăng nhập đã được sử dụng."
            ) {
                setUsernameError(requestError.message);
            } else {
                showTemporaryError(requestError.message);
            }
        } finally {
            setLoading(false);
        }
    }

    function switchMode(nextMode) {
        setMode(nextMode);
        setShowPassword(false);
        setShowPasswordConfirmation(false);
        clearError();
        setUsernameError("");
        setPasswordConfirmation("");
        setVerificationCode("");
        setCodeSent(false);
        setSuccessMessage("");
        setCaptchaToken("");
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
                            {mode === "login"
                                ? "Chào mừng trở lại"
                                : mode === "register"
                                  ? "Tài khoản mới"
                                  : "Khôi phục tài khoản"}
                        </span>
                        <h2 id="accountDialogTitle">
                            {mode === "login"
                                ? "Đăng nhập"
                                : mode === "register"
                                  ? "Đăng ký học sinh"
                                  : "Quên mật khẩu"}
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
                {mode !== "recover" && (
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
                )}
                {mode === "recover" && (
                    <button
                        className="textButton recoverBackButton"
                        type="button"
                        onClick={() => switchMode("login")}
                    >
                        ← Quay lại đăng nhập
                    </button>
                )}
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
                    {(mode === "register" || mode === "recover") && (
                        <label>
                            Email
                            <input
                                autoComplete="email"
                                maxLength={254}
                                required
                                type="email"
                                value={email}
                                onChange={(event) => {
                                    setEmail(event.target.value);
                                    clearError();
                                }}
                                placeholder="ban@example.com"
                                readOnly={codeSent}
                            />
                        </label>
                    )}
                    {(mode === "login" || mode === "register") && (
                        <label>
                            Tên đăng nhập
                            <input
                                autoComplete="username"
                                minLength={3}
                                maxLength={24}
                                required
                                pattern={
                                    mode === "register"
                                        ? "[a-z0-9]{3,24}"
                                        : undefined
                                }
                                title={
                                    mode === "register"
                                        ? "Viết liền, không dấu; chỉ dùng chữ cái a-z và số 0-9."
                                        : undefined
                                }
                                readOnly={mode === "register" && codeSent}
                                value={username}
                                autoCapitalize="none"
                                spellCheck="false"
                                aria-invalid={Boolean(usernameError)}
                                aria-describedby={[
                                    mode === "register"
                                        ? "account-username-hint"
                                        : null,
                                    usernameError
                                        ? "account-username-error"
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(" ") || undefined}
                                onChange={(event) => {
                                    setUsername(
                                        mode === "register"
                                            ? event.target.value.toLowerCase()
                                            : event.target.value,
                                    );
                                    setUsernameError("");
                                    clearError();
                                }}
                                placeholder="Ví dụ: lehohoanghuy"
                            />
                            {mode === "register" && (
                                <span
                                    id="account-username-hint"
                                    className="accountFieldHint"
                                >
                                    Lưu ý: Tên đăng nhập là chuỗi ký tự viết
                                    liền, không dấu, không khoảng trắng; chỉ
                                    dùng chữ cái a–z và số 0–9. Ví dụ:
                                    lehohoanghuy.
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
                    )}
                    {(mode !== "recover" || codeSent) && (
                        <label>
                            {mode === "recover" ? "Mật khẩu mới" : "Mật khẩu"}
                            <span className="passwordInputWrap">
                                <input
                                    id="account-password"
                                    autoComplete={
                                        mode === "login"
                                            ? "current-password"
                                            : "new-password"
                                    }
                                    minLength={8}
                                    maxLength={128}
                                    required
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    placeholder="Tối thiểu 8 ký tự"
                                />
                                <button
                                    className="passwordVisibilityToggle"
                                    type="button"
                                    aria-label={
                                        showPassword
                                            ? "Ẩn mật khẩu"
                                            : "Hiện mật khẩu"
                                    }
                                    aria-controls="account-password"
                                    aria-pressed={showPassword}
                                    onClick={() =>
                                        setShowPassword((visible) => !visible)
                                    }
                                >
                                    {showPassword ? "Ẩn" : "Hiện"}
                                </button>
                            </span>
                        </label>
                    )}
                    {(mode === "register" || (mode === "recover" && codeSent)) && (
                        <label>
                            {mode === "recover"
                                ? "Nhập lại mật khẩu mới"
                                : "Nhập lại mật khẩu"}
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
                                        clearError();
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
                    {codeSent && (
                        <label>
                            Mã xác thực email
                            <input
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                required
                                value={verificationCode}
                                onChange={(event) =>
                                    setVerificationCode(
                                        event.target.value.replace(/\D/gu, "").slice(0, 6),
                                    )
                                }
                                placeholder="Nhập mã 6 chữ số"
                            />
                            <span className="accountFieldHint">
                                Mã có hiệu lực trong 10 phút. Hãy kiểm tra cả thư mục thư rác.
                            </span>
                        </label>
                    )}
                    {requiresCaptcha && (
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
                            ? "Tên đăng nhập dài 3–24 ký tự, viết liền không dấu; mật khẩu dài 8–128 ký tự. Tài khoản mới mặc định là học sinh."
                            : mode === "recover"
                              ? "Nhập email đã xác thực để nhận mã đặt lại mật khẩu."
                              : "Nhập tên đăng nhập và mật khẩu của bạn."}
                    </p>
                    {successMessage && (
                        <p className="successMessage" role="status">
                            {successMessage}
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
                            (requiresCaptcha && (!captchaToken || !captchaSiteKey))
                        }
                    >
                        {loading
                            ? "Đang xử lý…"
                            : mode === "login"
                              ? "Đăng nhập"
                              : mode === "register"
                                ? codeSent
                                    ? "Tạo tài khoản"
                                    : "Gửi mã xác thực"
                                : codeSent
                                  ? "Đặt lại mật khẩu"
                                  : "Gửi mã đặt lại mật khẩu"}
                    </button>
                </form>
                {codeSent && (
                    <button
                        className="textButton resendCodeButton"
                        type="button"
                        onClick={() => {
                            setCodeSent(false);
                            setVerificationCode("");
                            setSuccessMessage(
                                "Xác thực CAPTCHA để gửi lại mã hoặc đổi email.",
                            );
                            setError("");
                        }}
                    >
                        Gửi lại mã hoặc đổi email
                    </button>
                )}
                {mode === "login" && (
                    <button
                        className="textButton forgotPasswordButton"
                        type="button"
                        onClick={() => {
                            setMode("recover");
                            setCodeSent(false);
                            setVerificationCode("");
                            setSuccessMessage("");
                            setError("");
                        }}
                    >
                        Quên mật khẩu?
                    </button>
                )}
            </section>
        </div>
    );
}
