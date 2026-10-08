import { createHash } from "node:crypto";
import {
    ensureSameOrigin,
    getCookieValue,
    getDatabase,
    hashPassword,
    HttpError,
    publicUser,
    requireRole,
    requireUser,
    sendApiError,
    validateDisplayName,
    validatePassword,
    validateUsername,
} from "../../src/services/accountAuth.js";
import { getAiUsage, manageAiUsage } from "../../src/services/aiUsage.js";
import { resetLoginFailures } from "../../src/services/loginRateLimit.js";

const ROLES = new Set(["student", "teacher", "admin", "super_admin"]);

async function requireAiUsageTarget(db, userId) {
    const { data, error } = await db
        .from("account_users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Không tìm thấy tài khoản.");
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const db = getDatabase();
        const currentUser = await requireUser(db, req);
        requireRole(currentUser, ["admin", "super_admin"]);

        if (req.method === "GET") {
            const aiUsageUserId = req.query?.aiUsageFor;
            if (aiUsageUserId !== undefined) {
                if (
                    currentUser.role !== "super_admin" ||
                    typeof aiUsageUserId !== "string" ||
                    !/^[0-9a-f-]{36}$/i.test(aiUsageUserId)
                ) {
                    throw new HttpError(
                        403,
                        "Không có quyền xem hạn mức AI của tài khoản này.",
                    );
                }
                await requireAiUsageTarget(db, aiUsageUserId);
                const usage = await getAiUsage(db, aiUsageUserId);
                return res.status(200).json({ usage });
            }
            let query = db
                .from("account_users")
                .select(
                    "id, username, display_name, role, is_locked, is_root_admin, created_at",
                )
                .order("created_at", { ascending: false });
            if (currentUser.role === "admin") {
                query = query.in("role", ["student", "teacher"]);
            }
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ users: data.map(publicUser) });
        }

        if (req.method === "DELETE") {
            ensureSameOrigin(req);
            if (currentUser.role !== "super_admin") {
                throw new HttpError(
                    403,
                    "Chỉ super admin mới được xóa tài khoản trực tiếp.",
                );
            }
            const requestedIds = req.body?.userIds ?? req.query?.userId;
            const userIds = Array.isArray(requestedIds)
                ? requestedIds
                : [requestedIds];
            if (
                userIds.length === 0 ||
                userIds.length > 100 ||
                userIds.some(
                    (id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
                )
            ) {
                throw new HttpError(400, "Danh sách tài khoản được chọn không hợp lệ.");
            }
            if (userIds.includes(currentUser.id)) {
                throw new HttpError(400, "Không thể xóa tài khoản đang đăng nhập.");
            }
            const { error } = await db.rpc("delete_account_users", {
                p_user_ids: userIds,
            });
            if (error) {
                throw new HttpError(
                    409,
                    error.message || "Không thể xóa tài khoản này.",
                );
            }
            return res.status(200).json({ deletedUserIds: userIds });
        }

        if (req.method !== "PATCH") {
            res.setHeader("Allow", "GET, PATCH, DELETE");
            return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
        }
        ensureSameOrigin(req);
        if (req.body?.resetLoginAttempts === true) {
            if (currentUser.role !== "super_admin") {
                throw new HttpError(
                    403,
                    "Chỉ super admin được đặt lại lượt đăng nhập.",
                );
            }
            const userId = req.body?.userId;
            if (
                typeof userId !== "string" ||
                !/^[0-9a-f-]{36}$/i.test(userId)
            ) {
                throw new HttpError(400, "Tài khoản được chọn không hợp lệ.");
            }
            const { data: target, error } = await db
                .from("account_users")
                .select("username")
                .eq("id", userId)
                .maybeSingle();
            if (error) throw error;
            if (!target) throw new HttpError(404, "Không tìm thấy tài khoản.");
            await resetLoginFailures({ db, username: target.username });
            return res.status(200).json({
                success: true,
                message: "Đã đặt lại lượt đăng nhập sai và gỡ thời gian chờ.",
            });
        }
        if (req.body?.aiLimitAction !== undefined) {
            if (currentUser.role !== "super_admin") {
                throw new HttpError(
                    403,
                    "Chỉ super admin được quản lý hạn mức AI.",
                );
            }
            const userId = req.body?.userId;
            const action = req.body?.aiLimitAction;
            const amount = req.body?.amount;
            if (
                typeof userId !== "string" ||
                !/^[0-9a-f-]{36}$/i.test(userId)
            ) {
                throw new HttpError(400, "Tài khoản được chọn không hợp lệ.");
            }
            if (!["unlimited", "limited", "reset", "add"].includes(action)) {
                throw new HttpError(400, "Thao tác hạn mức AI không hợp lệ.");
            }
            if (
                action === "add" &&
                (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000)
            ) {
                throw new HttpError(
                    400,
                    "Số lượt cấp thêm phải từ 1 đến 1.000.000.",
                );
            }
            await requireAiUsageTarget(db, userId);
            const usage = await manageAiUsage(
                db,
                userId,
                action,
                action === "add" ? amount : null,
            );
            return res.status(200).json({ usage });
        }
        if (Array.isArray(req.body?.userIds)) {
            if (currentUser.role !== "super_admin") {
                throw new HttpError(
                    403,
                    "Chỉ super admin được chỉnh sửa nhiều tài khoản cùng lúc.",
                );
            }
            const userIds = req.body.userIds;
            if (
                userIds.length === 0 ||
                userIds.length > 100 ||
                userIds.some(
                    (id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
                ) ||
                new Set(userIds).size !== userIds.length
            ) {
                throw new HttpError(400, "Danh sách tài khoản được chọn không hợp lệ.");
            }
            const changes = req.body?.changes;
            if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
                throw new HttpError(400, "Thông tin cập nhật không hợp lệ.");
            }
            const allowedKeys = new Set(["role", "isLocked"]);
            if (
                Object.keys(changes).some((key) => !allowedKeys.has(key)) ||
                (changes.role === undefined && changes.isLocked === undefined)
            ) {
                throw new HttpError(
                    400,
                    "Chỉnh sửa hàng loạt chỉ hỗ trợ vai trò và trạng thái khóa.",
                );
            }
            if (
                changes.isLocked === true &&
                userIds.includes(currentUser.id)
            ) {
                throw new HttpError(
                    400,
                    "Không thể khóa tài khoản đang đăng nhập.",
                );
            }
            const { error } = await db.rpc("update_account_users", {
                p_user_ids: userIds,
                p_role: changes.role ?? null,
                p_is_locked: changes.isLocked ?? null,
            });
            if (error) {
                throw new HttpError(
                    409,
                    error.message || "Không thể chỉnh sửa các tài khoản đã chọn.",
                );
            }
            return res.status(200).json({ updatedUserIds: userIds });
        }
        const userId = req.body?.userId;
        if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
            throw new HttpError(400, "Tài khoản được chọn không hợp lệ.");
        }
        const { data: target, error: targetError } = await db
            .from("account_users")
            .select(
                "id, username, display_name, role, is_locked, is_root_admin, created_at",
            )
            .eq("id", userId)
            .maybeSingle();
        if (targetError) throw targetError;
        if (!target) throw new HttpError(404, "Không tìm thấy tài khoản.");
        if (target.is_root_admin && !currentUser.is_root_admin) {
            throw new HttpError(
                403,
                "Chỉ super admin gốc mới có thể thay đổi tài khoản này.",
            );
        }

        if (
            currentUser.role === "admin" &&
            !["student", "teacher"].includes(target.role)
        ) {
            throw new HttpError(
                403,
                "Admin chỉ được quản lý thông tin đăng nhập của học sinh và giáo viên.",
            );
        }

        const changes = req.body?.changes;
        if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
            throw new HttpError(400, "Thông tin cập nhật không hợp lệ.");
        }
        const updates = {};
        if (Object.hasOwn(changes, "role")) {
            if (currentUser.role !== "super_admin") {
                throw new HttpError(403, "Chỉ super admin được cấp hoặc tước vai trò.");
            }
            if (!ROLES.has(changes.role)) {
                throw new HttpError(400, "Vai trò được chọn không hợp lệ.");
            }
            if (target.is_root_admin && changes.role !== "super_admin") {
                throw new HttpError(
                    400,
                    "Tài khoản super admin gốc không thể bị tước vai trò.",
                );
            }
            if (
                target.role === "super_admin" &&
                changes.role !== "super_admin"
            ) {
                const { count, error } = await db
                    .from("account_users")
                    .select("id", { count: "exact", head: true })
                    .eq("role", "super_admin")
                    .eq("is_locked", false);
                if (error) throw error;
                if (count <= 1) {
                    throw new HttpError(
                        409,
                        "Không thể tước vai trò super admin cuối cùng.",
                    );
                }
            }
            updates.role = changes.role;
        }
        if (Object.hasOwn(changes, "isLocked")) {
            if (currentUser.role !== "super_admin") {
                throw new HttpError(403, "Chỉ super admin được khóa hoặc mở khóa tài khoản.");
            }
            if (typeof changes.isLocked !== "boolean") {
                throw new HttpError(400, "Trạng thái khóa không hợp lệ.");
            }
            if (changes.isLocked && target.id === currentUser.id) {
                throw new HttpError(400, "Không thể khóa tài khoản đang đăng nhập.");
            }
            if (target.is_root_admin && changes.isLocked) {
                throw new HttpError(
                    400,
                    "Tài khoản super admin gốc không thể bị khóa.",
                );
            }
            if (
                changes.isLocked &&
                target.role === "super_admin" &&
                target.is_locked === false
            ) {
                const { count, error } = await db
                    .from("account_users")
                    .select("id", { count: "exact", head: true })
                    .eq("role", "super_admin")
                    .eq("is_locked", false);
                if (error) throw error;
                if (count <= 1) {
                    throw new HttpError(
                        409,
                        "Không thể khóa super admin đang hoạt động cuối cùng.",
                    );
                }
            }
            updates.is_locked = changes.isLocked;
        }
        if (Object.hasOwn(changes, "username")) {
            updates.username = validateUsername(changes.username);
        }
        if (Object.hasOwn(changes, "displayName")) {
            updates.display_name = validateDisplayName(changes.displayName);
        }

        let passwordHash;
        if (Object.hasOwn(changes, "password")) {
            passwordHash = await hashPassword(validatePassword(changes.password));
            updates.password_hash = passwordHash;
        }
        if (Object.keys(updates).length === 0 && !passwordHash) {
            throw new HttpError(400, "Chưa có thay đổi nào để lưu.");
        }

        if (Object.keys(updates).length) {
            const { error } = await db
                .from("account_users")
                .update(updates)
                .eq("id", target.id);
            if (error?.code === "23505") {
                throw new HttpError(409, "Tên đăng nhập đã được sử dụng.");
            }
            if (error) throw error;
        }
        if (passwordHash || updates.is_locked === true) {
            let sessionsQuery = db
                .from("account_sessions")
                .delete()
                .eq("user_id", target.id);
            if (passwordHash && target.id === currentUser.id) {
                const currentToken = getCookieValue(req);
                if (currentToken) {
                    const currentTokenHash = createHash("sha256")
                        .update(currentToken)
                        .digest("hex");
                    sessionsQuery = sessionsQuery.neq(
                        "token_hash",
                        currentTokenHash,
                    );
                }
            }
            const { error } = await sessionsQuery;
            if (error) throw error;
        }

        const { data: updatedUser, error: updatedError } = await db
            .from("account_users")
            .select(
                "id, username, display_name, role, is_locked, is_root_admin, created_at",
            )
            .eq("id", target.id)
            .single();
        if (updatedError) throw updatedError;
        return res.status(200).json({ user: publicUser(updatedUser) });
    } catch (error) {
        return sendApiError(res, error, "Lỗi quản lý tài khoản:");
    }
}
