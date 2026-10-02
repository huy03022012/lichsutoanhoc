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
    validatePassword,
    validateUsername,
} from "../../src/services/accountAuth.js";

const ROLES = new Set(["student", "teacher", "admin", "super_admin"]);

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const db = getDatabase();
        const currentUser = await requireUser(db, req);
        requireRole(currentUser, ["admin", "super_admin"]);

        if (req.method === "GET") {
            let query = db
                .from("account_users")
                .select("id, username, role, is_locked, created_at")
                .order("created_at", { ascending: false });
            if (currentUser.role === "admin") {
                query = query.in("role", ["student", "teacher"]);
            }
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ users: data.map(publicUser) });
        }

        if (req.method !== "PATCH") {
            res.setHeader("Allow", "GET, PATCH");
            return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
        }
        ensureSameOrigin(req);
        const userId = req.body?.userId;
        if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
            throw new HttpError(400, "Tài khoản được chọn không hợp lệ.");
        }
        const { data: target, error: targetError } = await db
            .from("account_users")
            .select("id, username, role, is_locked, created_at")
            .eq("id", userId)
            .maybeSingle();
        if (targetError) throw targetError;
        if (!target) throw new HttpError(404, "Không tìm thấy tài khoản.");

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
                throw new HttpError(409, "Tên tài khoản này đã được sử dụng.");
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
            .select("id, username, role, is_locked, created_at")
            .eq("id", target.id)
            .single();
        if (updatedError) throw updatedError;
        return res.status(200).json({ user: publicUser(updatedUser) });
    } catch (error) {
        return sendApiError(res, error, "Lỗi quản lý tài khoản:");
    }
}
