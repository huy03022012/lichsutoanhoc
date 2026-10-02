import { useEffect, useState } from "react";
import {
    deleteManagedUser,
    deleteManagedUsers,
    getAccountDeletionRequests,
    getManagedUsers,
    requestAccountDeletions,
    requestAccountDeletion,
    resolveAccountDeletionRequest,
    updateManagedUser,
    updateManagedUsers,
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
    const [displayName, setDisplayName] = useState(
        user.displayName || user.username,
    );
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
        if (displayName.trim() !== (user.displayName || user.username)) {
            changes.displayName = displayName;
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
                <span>
                    {user.displayName || user.username}{" "}
                    <span className="muted">@{user.username}</span>
                </span>
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
                                        pattern={
                                            /^[a-z0-9]{3,24}$/.test(user.username)
                                                ? "[A-Za-z0-9]{3,24}"
                                                : undefined
                                        }
                                        minLength={3}
                                        maxLength={24}
                                        value={username}
                                        title="Viết liền, không dấu; chỉ dùng chữ cái a-z và số 0-9."
                                        autoCapitalize="none"
                                        spellCheck="false"
                                        onChange={(event) =>
                                            setUsername(event.target.value)
                                        }
                                    />
                                </label>
                                <label>
                                    Tên hiển thị
                                    <input
                                        maxLength={60}
                                        value={displayName}
                                        onChange={(event) =>
                                            setDisplayName(event.target.value)
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
                            user.id === currentUser.id
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
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [bulkRole, setBulkRole] = useState("");
    const [bulkLock, setBulkLock] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);

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

    function addDeletionRequests(requests) {
        setDeletionRequests((current) => [...current, ...requests]);
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
        const searchableText = `${managedUser.displayName || ""} ${managedUser.username} ${roleLabels[managedUser.role]}`
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLocaleLowerCase("vi");
        return searchableText.includes(normalizedSearchTerm);
    });
    const selectedUsers = users.filter((managedUser) =>
        selectedUserIds.includes(managedUser.id),
    );
    const selectedStudentsOnly =
        selectedUsers.length > 0 &&
        selectedUsers.every((item) => item.role === "student");
    const selectableVisibleUsers = filteredUsers.filter(
        (item) => !item.is_root_admin && item.id !== user.id,
    );

    function toggleUserSelection(userId, selected) {
        setSelectedUserIds((current) =>
            selected
                ? current.includes(userId)
                    ? current
                    : [...current, userId]
                : current.filter((id) => id !== userId),
        );
    }

    function toggleVisibleSelection(selected) {
        setSelectedUserIds((current) => {
            const visibleIds = selectableVisibleUsers.map((item) => item.id);
            if (!selected) {
                return current.filter((id) => !visibleIds.includes(id));
            }
            return [...new Set([...current, ...visibleIds])];
        });
    }

    async function applyBulkUpdate() {
        const changes = {};
        if (bulkRole) changes.role = bulkRole;
        if (bulkLock !== "") changes.isLocked = bulkLock === "locked";
        if (selectedUserIds.length === 0 || Object.keys(changes).length === 0) {
            return;
        }
        setBulkBusy(true);
        setError("");
        try {
            await updateManagedUsers(selectedUserIds, changes);
            setSelectedUserIds([]);
            setBulkRole("");
            setBulkLock("");
            await loadUsers();
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setBulkBusy(false);
        }
    }

    async function applyBulkDeletion() {
        if (selectedUserIds.length === 0) return;
        if (
            user.role === "admin" &&
            !selectedUsers.every((item) => item.role === "student")
        ) {
            setError("Admin chỉ có thể yêu cầu xóa các tài khoản học sinh.");
            return;
        }
        const confirmed = globalThis.confirm(
            user.role === "admin"
                ? `Gửi yêu cầu xóa cho ${selectedUserIds.length} học sinh để super admin duyệt?`
                : `Xóa ${selectedUserIds.length} tài khoản đã chọn? Không thể xóa giáo viên; bài tập do tài khoản bị xóa tạo và bài nộp liên quan cũng sẽ bị xóa.`,
        );
        if (!confirmed) return;

        setBulkBusy(true);
        setError("");
        try {
            if (user.role === "admin") {
                const result = await requestAccountDeletions(selectedUserIds);
                addDeletionRequests(result.requests);
            } else {
                await deleteManagedUsers(selectedUserIds);
                setUsers((current) =>
                    current.filter((item) => !selectedUserIds.includes(item.id)),
                );
            }
            setSelectedUserIds([]);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setBulkBusy(false);
        }
    }

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
            {!loading && filteredUsers.length > 0 && (
                <>
                    <label className="inlineCheck selectVisibleAccounts">
                        <input
                            type="checkbox"
                            checked={
                                selectableVisibleUsers.length > 0 &&
                                selectableVisibleUsers.every((item) =>
                                    selectedUserIds.includes(item.id),
                                )
                            }
                            onChange={(event) =>
                                toggleVisibleSelection(event.target.checked)
                            }
                        />
                        Chọn tất cả tài khoản đang hiển thị
                    </label>
                    {selectedUserIds.length > 0 && (
                        <div className="bulkAccountActions">
                            <strong>
                                Đã chọn {selectedUserIds.length} tài khoản
                            </strong>
                            {user.role === "super_admin" && (
                                <>
                                    <select
                                        aria-label="Đổi vai trò hàng loạt"
                                        value={bulkRole}
                                        onChange={(event) =>
                                            setBulkRole(event.target.value)
                                        }
                                    >
                                        <option value="">Giữ nguyên vai trò</option>
                                        {roles.map((role) => (
                                            <option value={role} key={role}>
                                                {roleLabels[role]}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        aria-label="Đổi trạng thái khóa hàng loạt"
                                        value={bulkLock}
                                        onChange={(event) =>
                                            setBulkLock(event.target.value)
                                        }
                                    >
                                        <option value="">Giữ nguyên khóa</option>
                                        <option value="locked">Khóa</option>
                                        <option value="unlocked">Mở khóa</option>
                                    </select>
                                    <button
                                        className="primary"
                                        type="button"
                                        disabled={
                                            bulkBusy || (!bulkRole && !bulkLock)
                                        }
                                        onClick={applyBulkUpdate}
                                    >
                                        {bulkBusy ? "Đang lưu…" : "Áp dụng chỉnh sửa"}
                                    </button>
                                </>
                            )}
                            <button
                                className="secondary"
                                type="button"
                                disabled={
                                    bulkBusy ||
                                    (user.role === "admin" &&
                                        !selectedStudentsOnly) ||
                                    (user.role === "super_admin" &&
                                        selectedUsers.some(
                                            (item) => item.role === "teacher",
                                        ))
                                }
                                onClick={applyBulkDeletion}
                            >
                                {user.role === "admin"
                                    ? "Yêu cầu xóa học sinh"
                                    : "Xóa tài khoản đã chọn"}
                            </button>
                            <button
                                className="textButton"
                                type="button"
                                onClick={() => setSelectedUserIds([])}
                            >
                                Bỏ chọn
                            </button>
                        </div>
                    )}
                </>
            )}
            {loading ? (
                <p className="muted">Đang tải tài khoản…</p>
            ) : users.length ? (
                filteredUsers.length ? (
                    <div className="managedUsers">
                        {filteredUsers.map((managedUser) => (
                            <div
                                className="managedUserSelectRow"
                                key={managedUser.id}
                            >
                                <input
                                    type="checkbox"
                                    aria-label={`Chọn tài khoản ${managedUser.username}`}
                                    checked={selectedUserIds.includes(
                                        managedUser.id,
                                    )}
                                    disabled={
                                        managedUser.is_root_admin ||
                                        managedUser.id === user.id
                                    }
                                    onChange={(event) =>
                                        toggleUserSelection(
                                            managedUser.id,
                                            event.target.checked,
                                        )
                                    }
                                />
                                <ManagedUserRow
                                    user={managedUser}
                                    currentUser={user}
                                    deletionRequest={deletionRequests.find(
                                        (request) =>
                                            request.target_user_id ===
                                            managedUser.id,
                                    )}
                                    onUpdated={replaceUser}
                                    onDeleted={removeUser}
                                    onDeletionRequested={addDeletionRequest}
                                />
                            </div>
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
