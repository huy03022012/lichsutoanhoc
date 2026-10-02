import { useState } from "react";
import { submitAccountAction } from "../../services/api.js";

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
    const [error, setError] = useState("");
    const [usernameError, setUsernameError] = useState("");
    const [loading, setLoading] = useState(false);

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
        try {
            const result = await submitAccountAction(mode, {
                username,
                displayName,
                password,
                passwordConfirmation,
            });
            onAuthenticated(result.user);
        } catch (requestError) {
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

    return (
        <div
            className="accountDialogBackdrop"
            onMouseDown={required ? undefined : onClose}
        >
            <section
                className="accountDialog"
                role="dialog"
                aria-modal="true"
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
                            aria-describedby={
                                usernameError ? "account-username-error" : undefined
                            }
                            onChange={(event) => {
                                setUsername(event.target.value);
                                setUsernameError("");
                                setError("");
                            }}
                            placeholder="Ví dụ: lehohoanghuy"
                        />
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
                            <input
                                autoComplete="new-password"
                                minLength={8}
                                maxLength={128}
                                required
                                type={showPassword ? "text" : "password"}
                                value={passwordConfirmation}
                                onChange={(event) => {
                                    setPasswordConfirmation(event.target.value);
                                    setError("");
                                }}
                                placeholder="Nhập lại mật khẩu"
                            />
                        </label>
                    )}
                    <p className="muted accountHint">
                        {mode === "register"
                            ? "Tên đăng nhập viết liền, không dấu, dài 3–24 ký tự; chỉ dùng chữ cái a-z và số 0-9. Tên hiển thị có thể viết tiếng Việt. Đăng ký mới mặc định là học sinh."
                            : "Nhập tên đăng nhập và mật khẩu của bạn."}
                    </p>
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                    <button className="primary accountSubmit" disabled={loading}>
                        {loading
                            ? "Đang xử lý…"
                            : mode === "login"
                              ? "Đăng nhập"
                              : "Tạo tài khoản"}
                    </button>
                </form>
                <p className="accountModeSwitch">
                    {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
                    <button
                        className="textButton"
                        type="button"
                        onClick={() => {
                            setMode((current) =>
                                current === "login" ? "register" : "login",
                            );
                            setShowPassword(false);
                            setError("");
                            setUsernameError("");
                            setPasswordConfirmation("");
                        }}
                    >
                        {mode === "login" ? "Đăng ký học sinh" : "Đăng nhập"}
                    </button>
                </p>
            </section>
        </div>
    );
}
