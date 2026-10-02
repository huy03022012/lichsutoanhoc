import {
    ensureSameOrigin,
    getDatabase,
    HttpError,
    requireRole,
    requireUser,
    sendApiError,
} from "../../src/services/accountAuth.js";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const db = getDatabase();
        const currentUser = await requireUser(db, req);
        requireRole(currentUser, ["admin", "super_admin"]);

        if (req.method === "GET") {
            let query = db
                .from("account_deletion_requests")
                .select(
                    "id, target_user_id, target_username, requested_by, requested_by_username, status, created_at",
                )
                .eq("status", "pending")
                .order("created_at", { ascending: true });
            if (currentUser.role === "admin") {
                query = query.eq("requested_by", currentUser.id);
            }
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ requests: data });
        }

        if (req.method === "POST") {
            ensureSameOrigin(req);
            if (currentUser.role !== "admin") {
                throw new HttpError(
                    403,
                    "Chỉ admin mới gửi yêu cầu xóa tài khoản.",
                );
            }
            const requestedIds = req.body?.userIds ?? req.body?.userId;
            const targetIds = Array.isArray(requestedIds)
                ? requestedIds
                : [requestedIds];
            if (
                targetIds.length === 0 ||
                targetIds.length > 100 ||
                targetIds.some(
                    (id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
                ) ||
                new Set(targetIds).size !== targetIds.length
            ) {
                throw new HttpError(400, "Danh sách tài khoản được chọn không hợp lệ.");
            }
            const { data: target, error: targetError } = await db
                .from("account_users")
                .select("id, username, role, is_root_admin")
                .in("id", targetIds);
            if (targetError) throw targetError;
            const targets = target.filter(({ id }) => targetIds.includes(id));
            if (targets.length !== targetIds.length) {
                throw new HttpError(404, "Một hoặc nhiều tài khoản không tồn tại.");
            }
            if (targets.some(({ role, is_root_admin }) =>
                role !== "student" || is_root_admin
            )) {
                throw new HttpError(
                    403,
                    "Admin chỉ có thể yêu cầu xóa tài khoản học sinh.",
                );
            }
            const { data: deletionRequests, error } = await db
                .from("account_deletion_requests")
                .insert(
                    targets.map((targetUser) => ({
                        target_user_id: targetUser.id,
                        target_username: targetUser.username,
                        requested_by: currentUser.id,
                        requested_by_username: currentUser.username,
                    })),
                )
                .select(
                    "id, target_user_id, target_username, requested_by, requested_by_username, status, created_at",
                );
            if (error?.code === "23505") {
                throw new HttpError(
                    409,
                    "Đã có ít nhất một yêu cầu đang chờ xử lý cho tài khoản được chọn.",
                );
            }
            if (error) throw error;
            return res.status(201).json({
                requests: deletionRequests,
                request: deletionRequests.length === 1 ? deletionRequests[0] : undefined,
            });
        }

        if (req.method === "PATCH") {
            ensureSameOrigin(req);
            if (currentUser.role !== "super_admin") {
                throw new HttpError(
                    403,
                    "Chỉ super admin mới duyệt yêu cầu xóa.",
                );
            }
            const requestId = req.body?.requestId;
            const decision = req.body?.decision;
            if (
                typeof requestId !== "string" ||
                !/^[0-9a-f-]{36}$/i.test(requestId) ||
                !["approve", "reject"].includes(decision)
            ) {
                throw new HttpError(400, "Quyết định yêu cầu không hợp lệ.");
            }
            const { error } = await db.rpc("resolve_account_deletion_request", {
                p_request_id: requestId,
                p_reviewed_by: currentUser.id,
                p_approve: decision === "approve",
            });
            if (error) {
                throw new HttpError(
                    409,
                    error.message || "Không thể xử lý yêu cầu xóa.",
                );
            }
            return res.status(200).json({ requestId, decision });
        }

        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
    } catch (error) {
        return sendApiError(res, error, "Lỗi yêu cầu xóa tài khoản:");
    }
}
