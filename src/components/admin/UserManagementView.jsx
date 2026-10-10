import { useEffect, useState } from "react";
import {
    deleteManagedUser,
    deleteManagedUsers,
    getAccountDeletionRequests,
    getManagedUserAiUsage,
    getManagedUsers,
    manageManagedUserAiLimit,
    requestAccountDeletions,
    requestAccountDeletion,
    resetManagedUserLoginAttempts,
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

// Bộ điều khiển hạn mức AI cho tài khoản quản trị. Các hành động
// "limited/unlimited/reset/add" đều gọi API nhưng chỉ thay đổi quota của 1 user cụ thể,
// trong khi đồng hồ đếm ngược và thông báo `resetAt` được cập nhật bằng setInterval để
// mô phỏng việc làm mới lượt AI theo thời gian thực.
function AiLimitControls({ userId, usage, onUsageChanged }) {
    const [amount, setAmount] = useState("10");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    // `apply` đóng vai trò thao tác quota AI: mỗi action (`limited`, `unlimited`,
    // `reset`, `add`) đều gửi request lên server rồi cập nhật kết quả ở UI. Điều
    // này đảm bảo trạng thái hiển thị luôn phản ánh quota thực tế sau khi admin thay đổi.
    async function apply(action) {
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const result = await manageManagedUserAiLimit(
                userId,
                action,
                action === "add" ? Number(amount) : undefined,
            );
            onUsageChanged(result.usage);
            setMessage(
                action === "reset"
                    ? "Đã đặt lại về 20 lượt mỗi 10 phút."
                    : action === "add"
                      ? `Đã cấp thêm ${amount} lượt AI.`
                      : action === "unlimited"
                        ? "Đã bỏ giới hạn AI cho tài khoản."
                        : "Đã bật lại giới hạn mặc định.",
            );
        } catch (actionError) {
            setError(actionError.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="aiLimitControls">
            <h3>Hạn mức AI</h3>
            {usage ? (
                <p className="muted">
                    {usage.privileged
                        ? "Tài khoản super admin gốc luôn được dùng AI không giới hạn."
                        : usage.unlimited
                          ? "Không giới hạn"
                          : `${usage.remaining} lượt còn lại (${usage.used} đã dùng${usage.bonus ? `, ${usage.bonus} lượt cộng thêm` : ""})`}
                    {!usage.privileged && !usage.unlimited && usage.resetAt && (
                        <>
                            {" · Làm mới lúc "}
                            {new Date(usage.resetAt).toLocaleTimeString(
                                "vi-VN",
                                { hour: "2-digit", minute: "2-digit" },
                            )}
                        </>
                    )}
                </p>
            ) : (
                <p className="muted">Đang tải hạn mức…</p>
            )}
            {!usage?.privileged && (
                <div className="aiLimitActions">
                    <button
                        className="secondary"
                        type="button"
                        disabled={busy || usage?.unlimited !== true}
                        onClick={() => apply("limited")}
                    >
                        Bật giới hạn mặc định
                    </button>
                    <button
                        className="secondary"
                        type="button"
                        disabled={busy || usage?.unlimited === true}
                        onClick={() => apply("unlimited")}
                    >
                        Bỏ giới hạn
                    </button>
                    <button
                        className="secondary"
                        type="button"
                        disabled={busy || !usage}
                        onClick={() => apply("reset")}
                    >
                        Đặt lại 20 lượt
                    </button>
                    <label>
                        Cấp thêm lượt
                        <input
                            type="number"
                            min="1"
                            max="1000000"
                            step="1"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                        />
                    </label>
                    <button
                        className="secondary"
                        type="button"
                        disabled={
                            busy ||
                            !Number.isInteger(Number(amount)) ||
                            Number(amount) < 1 ||
                            Number(amount) > 1_000_000
                        }
                        onClick={() => apply("add")}
                    >
                        Cấp lượt
                    </button>
                </div>
            )}
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            {message && (
                <p className="muted" role="status">
                    {message}
                </p>
            )}
        </section>
    );
}

// Mỗi hàng tài khoản tách riêng các state cập nhật local (username, displayName, role, lock)
// khỏi danh sách tổng, nên khi admin mở rộng chi tiết vẫn có thể chỉnh sửa từng trường
// rồi lưu từng thay đổi mà không làm ảnh hưởng đến các tài khoản khác trong bảng.
function ManagedUserRow({
    user,
    currentUser,
    selected,
    onSelectionChange,
    deletionRequest,
    onUpdated,
    onDeleted,
    onDeletionRequested,
}) {
    const [expanded, setExpanded] = useState(false);
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
    const [aiUsage, setAiUsage] = useState(null);
    const [aiUsageError, setAiUsageError] = useState("");
    const [usageNow, setUsageNow] = useState(Date.now());
    const isSuperAdmin = currentUser.role === "super_admin";
    const isRootAdmin = user.is_root_admin;
    const isProtectedRoot = user.is_root_admin && !currentUser.is_root_admin;
    const canChangeCredentials =
        (!isProtectedRoot && isSuperAdmin) ||
        (currentUser.role === "admin" &&
            ["student", "teacher"].includes(user.role));
    const waitingForAiReset =
        isSuperAdmin &&
        aiUsage &&
        !aiUsage.unlimited &&
        aiUsage.remaining <= 0;

    useEffect(() => {
        if (!isSuperAdmin) return undefined;
        let active = true;
        getManagedUserAiUsage(user.id)
            .then((result) => {
                if (active) {
                    setAiUsage(result.usage);
                    setAiUsageError("");
                }
            })
            .catch((loadError) => {
                if (active) setAiUsageError(loadError.message);
            });
        return () => {
            active = false;
        };
    }, [isSuperAdmin, user.id]);

    useEffect(() => {
        if (!waitingForAiReset) return undefined;
        const interval = window.setInterval(() => {
            const now = Date.now();
            setUsageNow(now);
            if (now >= Date.parse(aiUsage.resetAt)) {
                window.clearInterval(interval);
                getManagedUserAiUsage(user.id)
                    .then((result) => {
                        setAiUsage(result.usage);
                        setAiUsageError("");
                    })
                    .catch((loadError) => setAiUsageError(loadError.message));
            }
        }, 1000);
        return () => window.clearInterval(interval);
    }, [aiUsage?.resetAt, isSuperAdmin, user.id, waitingForAiReset]);

    async function deleteUser() {
        if (
            currentUser.role !== "super_admin" ||
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

    async function resetLoginAttempts() {
        setLoading(true);
        setError("");
        setActionMessage("");
        try {
            const result = await resetManagedUserLoginAttempts(user.id);
            setActionMessage(result.message);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    // save chỉ gửi những field thực sự thay đổi, tránh ghi đè dữ liệu không cần thiết
    // khi người dùng mở rộng chi tiết nhưng không sửa gì. Vì quyền thay đổi của admin
    // và super_admin khác nhau, `changes` được build theo từng điều kiện an toàn.
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
        <>
            <tr className="managedUserTableRow">
                <td>
                    <input
                        type="checkbox"
                        aria-label={`Chọn tài khoản ${user.username}`}
                        checked={selected}
                        disabled={user.is_root_admin || user.id === currentUser.id}
                        onChange={(event) =>
                            onSelectionChange(user.id, event.target.checked)
                        }
                    />
                </td>
                <td className="managedUserName" title={user.displayName || user.username}>
                    {user.displayName || user.username}
                </td>
                <td className="managedUserUsername" title={`@${user.username}`}>
                    @{user.username}
                </td>
                <td>
                    <span className="managedUserBadges">
                        {user.is_root_admin ? (
                            <span className="tag managedUserRole">
                                Super Admin Gốc
                            </span>
                        ) : (
                            <span className="tag managedUserRole">
                                {roleLabels[user.role]}
                            </span>
                        )}
                    {isSuperAdmin && (
                        <span
                            className="managedUserAiUsage"
                            title={aiUsageError || undefined}
                        >
                            {aiUsage
                                ? aiUsage.unlimited
                                    ? "Không giới hạn AI"
                                    : aiUsage.remaining > 0
                                      ? `Còn ${aiUsage.remaining} lượt AI`
                                      : (() => {
                                            const seconds = Math.max(
                                                0,
                                                Math.ceil(
                                                    (Date.parse(aiUsage.resetAt) -
                                                        usageNow) /
                                                        1000,
                                                ),
                                            );
                                            return seconds > 0
                                                ? `Dùng lại sau ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                                                : "Đang làm mới lượt AI…";
                                        })()
                                : aiUsageError
                                  ? "Lỗi tải lượt AI"
                                  : "Đang tải lượt AI…"}
                        </span>
                    )}
                    {user.is_locked && (
                        <span className="lockedTag">Đã khóa</span>
                    )}
                    {deletionRequest && (
                        <span className="tag">Đang chờ duyệt xóa</span>
                    )}
                    </span>
                </td>
                <td>
                    <button
                        className="secondary"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpanded((value) => !value)}
                    >
                        {expanded ? "Đóng" : "Chỉnh sửa"}
                    </button>
                </td>
            </tr>
            {expanded && (
                <tr className="managedUserDetailsRow">
                    <td colSpan={5}>
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
                {isSuperAdmin && (
                    <AiLimitControls
                        userId={user.id}
                        usage={aiUsage}
                        onUsageChanged={setAiUsage}
                    />
                )}
                {isSuperAdmin && (
                    <button
                        className="secondary"
                        type="button"
                        disabled={loading}
                        onClick={resetLoginAttempts}
                    >
                        {loading
                            ? "Đang đặt lại…"
                            : "Đặt lại lượt đăng nhập"}
                    </button>
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
                {currentUser.role === "super_admin" ? (
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
                    </td>
                </tr>
            )}
        </>
    );
}

// Danh sách yêu cầu xóa tài khoản theo dõi trạng thái duyệt và liên kết với quyền root/admin.
// Mỗi request được resolve bằng API riêng, giúp tách rõ luồng phê duyệt khỏi các thao
// tác cập nhật thông tin người dùng thông thường.
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

// Trang quản trị người dùng tích hợp quyền hạn theo vai trò, quota AI, khóa tài khoản và
// phê duyệt xóa. `selected`/`bulk` actions chỉ cho phép thực hiện khi có quyền phù hợp,
// còn `canChangeCredentials` và `isProtectedRoot` chặn những thay đổi không được phép với root admin.
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
                : `Xóa ${selectedUserIds.length} tài khoản đã chọn? Thao tác này không thể hoàn tác. Bài tập do các tài khoản bị xóa tạo và bài nộp liên quan cũng sẽ bị xóa.`,
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
                            ? "Cấp hoặc tước vai trò, khóa, đổi thông tin và xóa học sinh, giáo viên hoặc admin. Super admin gốc và super admin hoạt động cuối cùng được bảo vệ."
                            : "Đổi thông tin học sinh, giáo viên và gửi yêu cầu xóa tài khoản học sinh để super admin duyệt."}
                    </p>
                </div>
                <button
                    className="primary"
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
                                        !selectedStudentsOnly)
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
                    <div className="managedUsersTableWrap">
                        <table className="managedUsersTable">
                            <thead>
                                <tr>
                                    <th scope="col">
                                        <input
                                            type="checkbox"
                                            aria-label="Chọn tất cả tài khoản đang hiển thị"
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
                                    </th>
                                    <th scope="col">Tên</th>
                                    <th scope="col">Username</th>
                                    <th scope="col">Vai trò</th>
                                    <th scope="col">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                        {filteredUsers.map((managedUser) => (
                            <ManagedUserRow
                                key={managedUser.id}
                                user={managedUser}
                                currentUser={user}
                                selected={selectedUserIds.includes(
                                    managedUser.id,
                                )}
                                onSelectionChange={toggleUserSelection}
                                deletionRequest={deletionRequests.find(
                                    (request) =>
                                        request.target_user_id ===
                                        managedUser.id,
                                )}
                                onUpdated={replaceUser}
                                onDeleted={removeUser}
                                onDeletionRequested={addDeletionRequest}
                            />
                        ))}
                            </tbody>
                        </table>
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
