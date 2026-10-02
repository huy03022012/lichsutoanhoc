import { useEffect, useState } from "react";
import {
    deleteManagedUser,
    getAccountDeletionRequests,
    getManagedUsers,
    requestAccountDeletion,
    resolveAccountDeletionRequest,
    updateManagedUser,
} from "../../services/api.js";

const roleLabels = {
    student: "Học sinh",
    teacher: "Giáo viên",
    admin: "Admin",
    super_admin: "Super admin",
};
const roles = Object.keys(roleLabels);

function ManagedUserRow({
    user,
    currentUser,
    deletionRequest,
    onUpdated,
    onDeleted,
    onDeletionRequested,
}) {
    const [username, setUsername] = useState(user.username);
    const [password, setPassword] = useState("");
    const [role, setRole] = useState(user.role);
    const [isLocked, setIsLocked] = useState(user.is_locked);
    const [error, setError] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const isSuperAdmin = currentUser.role === "super_admin";
    const isRootAdmin = user.is_root_admin;
    const isProtectedRoot = user.is_root_admin && !currentUser.is_root_admin;
    const canChangeCredentials =
        (!isProtectedRoot && isSuperAdmin) ||
        (currentUser.role === "admin" &&
            ["student", "teacher"].includes(user.role));

    async function deleteUser() {
        if (
            user.role === "teacher" ||
            user.is_root_admin ||
            user.id === currentUser.id
        ) {
            return;
        }
        const confirmed = globalThis.confirm(
            `Xóa tài khoản "${user.username}"? Thao tác này không thể hoàn tác. Bài tập do tài khoản này tạo và các bài nộp liên quan cũng sẽ bị xóa.`,
        );
        if (!confirmed) {
            return;
        }
        setLoading(true);
        setError("");
        setActionMessage("");
        try {
            await deleteManagedUser(user.id);
            onDeleted(user.id);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    async function requestDeletion() {
        setLoading(true);
        setError("");
        setActionMessage("");
        try {
            const result = await requestAccountDeletion(user.id);
            onDeletionRequested(result.request);
            setActionMessage("Đã gửi yêu cầu cho super admin duyệt.");
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

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
                {deletionRequest && (
                    <span className="tag">Đang chờ duyệt xóa</span>
                )}
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
                {!isProtectedRoot && (
                    <button className="primary" disabled={loading}>
                        {loading ? "Đang lưu…" : "Lưu thay đổi"}
                    </button>
                )}
                {user.role === "teacher" ? (
                    <p className="muted">
                        Tài khoản giáo viên không được phép xóa.
                    </p>
                ) : currentUser.role === "super_admin" ? (
                    <button
                        className="secondary"
                        type="button"
                        disabled={
                            loading ||
                            user.is_root_admin ||
                            user.id === currentUser.id ||
                            Boolean(deletionRequest)
                        }
                        onClick={deleteUser}
                    >
                        {loading ? "Đang xóa…" : "Xóa tài khoản"}
                    </button>
                ) : user.role === "student" ? (
                    <button
                        className="secondary"
                        type="button"
                        disabled={loading || Boolean(deletionRequest)}
                        onClick={requestDeletion}
                    >
                        {deletionRequest ? "Đang chờ super admin duyệt" : "Yêu cầu xóa tài khoản"}
                    </button>
                ) : null}
                {actionMessage && (
                    <p className="muted" role="status">
                        {actionMessage}
                    </p>
                )}
            </form>
        </details>
    );
}

function DeletionRequests({ requests, onResolved }) {
    const [busyRequestId, setBusyRequestId] = useState("");
    const [error, setError] = useState("");

    async function resolveRequest(request, decision) {
        setBusyRequestId(request.id);
        setError("");
        try {
            await resolveAccountDeletionRequest(request.id, decision);
            onResolved(request, decision);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setBusyRequestId("");
        }
    }

    if (!requests.length) return null;
    return (
        <section className="deletionRequests">
            <h2>Yêu cầu xóa tài khoản</h2>
            <p className="muted">
                Duyệt xóa sẽ xóa vĩnh viễn tài khoản học sinh và các bài nộp của
                tài khoản đó.
            </p>
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            <div className="managedUsers">
                {requests.map((request) => (
                    <article className="managedUser deletionRequest" key={request.id}>
                        <div>
                            <strong>{request.target_username}</strong>
                            <p className="muted">
                                Yêu cầu bởi {request.requested_by_username}
                            </p>
                        </div>
                        <div className="deletionRequestActions">
                            <button
                                className="secondary"
                                type="button"
                                disabled={busyRequestId === request.id}
                                onClick={() =>
                                    resolveRequest(request, "reject")
                                }
                            >
                                Từ chối
                            </button>
                            <button
                                className="primary"
                                type="button"
                                disabled={busyRequestId === request.id}
                                onClick={() =>
                                    resolveRequest(request, "approve")
                                }
                            >
                                {busyRequestId === request.id
                                    ? "Đang xử lý…"
                                    : "Duyệt xóa"}
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

export default function UserManagementView({ user, onCurrentUserUpdated }) {
    const [users, setUsers] = useState([]);
    const [deletionRequests, setDeletionRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    async function loadUsers() {
        setLoading(true);
        setError("");
        try {
            const [usersResult, requestsResult] = await Promise.all([
                getManagedUsers(),
                getAccountDeletionRequests(),
            ]);
            setUsers(usersResult.users);
            setDeletionRequests(requestsResult.requests);
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

    function removeUser(userId) {
        setUsers((current) => current.filter((item) => item.id !== userId));
        setDeletionRequests((current) =>
            current.filter((request) => request.target_user_id !== userId),
        );
    }

    function addDeletionRequest(request) {
        setDeletionRequests((current) => [...current, request]);
    }

    function resolveDeletionRequest(request, decision) {
        if (!request) return;
        setDeletionRequests((current) =>
            current.filter((item) => item.id !== request.id),
        );
        if (decision === "approve" && request.target_user_id) {
            removeUser(request.target_user_id);
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
                            ? "Cấp hoặc tước vai trò, khóa tài khoản, đổi thông tin và xóa tài khoản đủ điều kiện."
                            : "Đổi thông tin học sinh, giáo viên và gửi yêu cầu xóa tài khoản học sinh để super admin duyệt."}
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
            {user.role === "super_admin" && (
                <DeletionRequests
                    requests={deletionRequests}
                    onResolved={resolveDeletionRequest}
                />
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
                                deletionRequest={deletionRequests.find(
                                    (request) =>
                                        request.target_user_id === managedUser.id,
                                )}
                                onUpdated={replaceUser}
                                onDeleted={removeUser}
                                onDeletionRequested={addDeletionRequest}
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
