import { useState } from "react";
import { submitAccountAction } from "../../services/api.js";

export default function AccountDialog({ onClose, onAuthenticated }) {
    const [mode, setMode] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setLoading(true);
        setError("");
        try {
            const result = await submitAccountAction(mode, {
                username: username.trim().toLowerCase(),
                password,
            });
            onAuthenticated(result.user);
        } catch (requestError) {
            setError(requestError.message);
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
                        Tên tài khoản
                        <input
                            autoComplete="username"
                            minLength={3}
                            maxLength={24}
                            required
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="Ví dụ: Lê Hồ Hoàng Huy"
                        />
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
                    <p className="muted accountHint">
                        Tên tài khoản dài 3–24 ký tự; có thể dùng chữ tiếng Việt,
                        khoảng trắng, số, dấu chấm, gạch ngang hoặc gạch dưới.
                        Đăng ký mới mặc định là học sinh.
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
                        }}
                    >
                        {mode === "login" ? "Đăng ký học sinh" : "Đăng nhập"}
                    </button>
                </p>
            </section>
        </div>
    );
}
