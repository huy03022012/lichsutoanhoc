import { useState } from "react";
import { changeAccountPassword } from "../../services/api.js";

// Modal đổi mật khẩu cho người dùng đã đăng nhập. Mỗi trường nhập có toggle ẩn/hiện
// riêng, và thao tác lưu xác nhận lại bằng API sau khi so khớp mật khẩu mới với xác
// nhận để tránh rủi ro nhập nhầm trong các luồng bảo mật nhạy cảm.
export default function PasswordChangeDialog({ onClose, onChanged }) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [visible, setVisible] = useState({
        current: false,
        new: false,
        confirmation: false,
    });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Trước khi gọi API đổi mật khẩu, form phải kiểm tra hai trường mới khớp nhau
    // và không để state lỗi cũ ảnh hưởng đến request mới. Đây là flow bảo mật nhạy
    // cảm nên không cho phép `loading` lẫn `error` bị lưu quá lâu.
    async function submit(event) {
        event.preventDefault();
        setError("");
        if (newPassword !== passwordConfirmation) {
            setError("Mật khẩu mới nhập lại chưa khớp.");
            return;
        }

        setLoading(true);
        try {
            await changeAccountPassword(
                currentPassword,
                newPassword,
                passwordConfirmation,
            );
            onChanged();
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    // `passwordField` tạo lại same markup cho 3 trường với toggle riêng, giúp tránh
    // nhầm lẫn giữa trường mật khẩu hiện tại, mới và xác nhận mới trong cùng một form.
    function passwordField(label, field, value, setValue, autocomplete) {
        const inputId = `password-change-${field}`;
        const isVisible = visible[field];
        return (
            <label>
                {label}
                <span className="passwordInputWrap">
                    <input
                        id={inputId}
                        autoComplete={autocomplete}
                        minLength={8}
                        maxLength={128}
                        required
                        type={isVisible ? "text" : "password"}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder="Tối thiểu 8 ký tự"
                    />
                    <button
                        className="passwordVisibilityToggle"
                        type="button"
                        aria-label={`${isVisible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`}
                        aria-controls={inputId}
                        aria-pressed={isVisible}
                        onClick={() =>
                            setVisible((current) => ({
                                ...current,
                                [field]: !current[field],
                            }))
                        }
                    >
                        {isVisible ? "Ẩn" : "Hiện"}
                    </button>
                </span>
            </label>
        );
    }

    return (
        <div className="accountDialogBackdrop" onMouseDown={onClose}>
            <section
                className="accountDialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="passwordChangeTitle"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="accountDialogHeader">
                    <div>
                        <span className="tag">Bảo mật tài khoản</span>
                        <h2 id="passwordChangeTitle">Đổi mật khẩu</h2>
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
                    {passwordField(
                        "Mật khẩu hiện tại",
                        "current",
                        currentPassword,
                        setCurrentPassword,
                        "current-password",
                    )}
                    {passwordField(
                        "Mật khẩu mới",
                        "new",
                        newPassword,
                        setNewPassword,
                        "new-password",
                    )}
                    {passwordField(
                        "Nhập lại mật khẩu mới",
                        "confirmation",
                        passwordConfirmation,
                        setPasswordConfirmation,
                        "new-password",
                    )}
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                    <button className="primary accountSubmit" disabled={loading}>
                        {loading ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
                    </button>
                </form>
            </section>
        </div>
    );
}
