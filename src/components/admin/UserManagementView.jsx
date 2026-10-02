import { useEffect, useState } from "react";
import { getManagedUsers, updateManagedUser } from "../../services/api.js";

const roleLabels = {
    student: "Học sinh",
    teacher: "Giáo viên",
    admin: "Admin",
    super_admin: "Super admin",
};
const roles = Object.keys(roleLabels);

function ManagedUserRow({ user, currentUser, onUpdated }) {
    const [username, setUsername] = useState(user.username);
    const [password, setPassword] = useState("");
    const [role, setRole] = useState(user.role);
    const [isLocked, setIsLocked] = useState(user.is_locked);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const isSuperAdmin = currentUser.role === "super_admin";
    const isRootAdmin = user.is_root_admin;
    const isProtectedRoot = user.is_root_admin && !currentUser.is_root_admin;
    const canChangeCredentials =
        (!isProtectedRoot && isSuperAdmin) ||
        (currentUser.role === "admin" &&
            ["student", "teacher"].includes(user.role));

    async function save(event) {
        event.preventDefault();
        const changes = {};
        if (username.trim().toLowerCase() !== user.username) {
            changes.username = username;
        }
        if (password) changes.password = password;
        if (isSuperAdmin && role !== user.role) changes.role = role;
        if (isSuperAdmin && isLocked !== user.is_locked) {
            changes.isLocked = isLocked;
        }
        if (Object.keys(changes).length === 0) {
            setError("Chưa có thông tin nào thay đổi.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const result = await updateManagedUser(user.id, changes);
            setPassword("");
            onUpdated(result.user);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <details className="managedUser">
            <summary>
                <span>{user.username}</span>
                <span className="tag">{roleLabels[user.role]}</span>
                {user.is_root_admin && (
                    <span className="tag">Super admin gốc</span>
                )}
                {user.is_locked && <span className="lockedTag">Đã khóa</span>}
            </summary>
            <form className="managedUserForm" onSubmit={save}>
                {isProtectedRoot ? (
                    <p className="muted">
                        Tài khoản super admin gốc được bảo vệ; bạn không thể đổi
                        thông tin, vai trò hoặc khóa tài khoản này.
                    </p>
                ) : (
                    <>
                        {canChangeCredentials && (
                            <>
                                <label>
                                    Tên đăng nhập
                                    <input
                                        minLength={3}
                                        maxLength={24}
                                        value={username}
                                        onChange={(event) =>
                                            setUsername(event.target.value)
                                        }
                                    />
                                </label>
                                <label>
                                    Mật khẩu mới (để trống nếu không đổi)
                                    <input
                                        minLength={8}
                                        maxLength={128}
                                        type="password"
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(event) =>
                                            setPassword(event.target.value)
                                        }
                                    />
                                </label>
                            </>
                        )}
                        {isSuperAdmin && isRootAdmin ? (
                            <p className="muted">
                                Tài khoản này luôn giữ vai trò super admin và
                                không thể bị khóa.
                            </p>
                        ) : (
                            isSuperAdmin && (
                                <>
                                    <label>
                                        Vai trò
                                        <select
                                            value={role}
                                            onChange={(event) =>
                                                setRole(event.target.value)
                                            }
                                        >
                                            {roles.map((item) => (
                                                <option value={item} key={item}>
                                                    {roleLabels[item]}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="inlineCheck">
                                        <input
                                            type="checkbox"
                                            checked={isLocked}
                                            onChange={(event) =>
                                                setIsLocked(event.target.checked)
                                            }
                                        />
                                        Khóa tài khoản
                                    </label>
                                </>
                            )
                        )}
                    </>
                )}
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <button className="primary" disabled={loading}>
                    {loading ? "Đang lưu…" : "Lưu thay đổi"}
                </button>
            </form>
        </details>
    );
}

export default function UserManagementView({ user, onCurrentUserUpdated }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    async function loadUsers() {
        setLoading(true);
        setError("");
        try {
            const result = await getManagedUsers();
            setUsers(result.users);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadUsers();
    }, []);

    function replaceUser(updatedUser) {
        setUsers((current) =>
            current.map((item) =>
                item.id === updatedUser.id ? updatedUser : item,
            ),
        );
        if (updatedUser.id === user.id) {
            onCurrentUserUpdated(updatedUser);
        }
    }

    const normalizedSearchTerm = searchTerm
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("vi");
    const filteredUsers = users.filter((managedUser) => {
        const searchableText = `${managedUser.username} ${roleLabels[managedUser.role]}`
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLocaleLowerCase("vi");
        return searchableText.includes(normalizedSearchTerm);
    });

    return (
        <section className="view active">
            <div className="sectionHeader">
                <div>
                    <span className="tag">Quản trị</span>
                    <h1>Quản lý tài khoản</h1>
                    <p className="muted">
                        {user.role === "super_admin"
                            ? "Cấp hoặc tước mọi vai trò, khóa tài khoản và đổi thông tin đăng nhập."
                            : "Đổi tên đăng nhập hoặc mật khẩu cho học sinh và giáo viên."}
                    </p>
                </div>
                <button
                    className="secondary"
                    type="button"
                    onClick={loadUsers}
                    disabled={loading}
                >
                    Làm mới
                </button>
            </div>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            {!loading && users.length > 0 && (
                <form
                    className="accountSearch"
                    role="search"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setSearchTerm(searchInput.trim());
                    }}
                >
                    <input
                        type="search"
                        aria-label="Tìm theo tên hoặc vai trò tài khoản"
                        placeholder="Nhập tên hoặc vai trò tài khoản"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                    />
                    <button className="primary" type="submit">
                        Tìm kiếm
                    </button>
                </form>
            )}
            {loading ? (
                <p className="muted">Đang tải tài khoản…</p>
            ) : users.length ? (
                filteredUsers.length ? (
                    <div className="managedUsers">
                        {filteredUsers.map((managedUser) => (
                            <ManagedUserRow
                                key={managedUser.id}
                                user={managedUser}
                                currentUser={user}
                                onUpdated={replaceUser}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="card empty">
                        Không tìm thấy tài khoản phù hợp.
                    </div>
                )
            ) : (
                <div className="card empty">Chưa có tài khoản nào.</div>
            )}
        </section>
    );
}
