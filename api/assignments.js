import {
    ensureSameOrigin,
    getDatabase,
    HttpError,
    publicUser,
    requireRole,
    requireUser,
    sendApiError,
} from "../src/services/accountAuth.js";

const CREATORS = ["teacher", "admin", "super_admin"];

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const db = getDatabase();
        const user = await requireUser(db, req);

        if (req.method === "GET") {
            const { data: assignments, error } = await db
                .from("math_assignments")
                .select("id, title, description, created_by, created_at, updated_at")
                .order("created_at", { ascending: false });
            if (error) throw error;
            const ownerIds = [
                ...new Set(assignments.map((assignment) => assignment.created_by)),
            ];
            const { data: owners, error: ownerError } = ownerIds.length
                ? await db
                      .from("account_users")
                      .select("id, username")
                      .in("id", ownerIds)
                : { data: [], error: null };
            if (ownerError) throw ownerError;
            const usernames = new Map(owners.map((owner) => [owner.id, owner.username]));
            const { data: ownSubmissions, error: submissionError } = await db
                .from("math_submissions")
                .select("assignment_id, answer, teacher_feedback, submitted_at, updated_at")
                .eq("student_id", user.id);
            if (submissionError) throw submissionError;
            const submissions = new Map(
                ownSubmissions.map((submission) => [
                    submission.assignment_id,
                    submission,
                ]),
            );
            return res.status(200).json({
                assignments: assignments.map((assignment) => ({
                    ...assignment,
                    creatorUsername:
                        usernames.get(assignment.created_by) ?? "Giáo viên",
                    submission: submissions.get(assignment.id) ?? null,
                })),
            });
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
        }
        ensureSameOrigin(req);
        requireRole(user, CREATORS);
        const title =
            typeof req.body?.title === "string" ? req.body.title.trim() : "";
        const description =
            typeof req.body?.description === "string"
                ? req.body.description.trim()
                : "";
        if (title.length < 1 || title.length > 120) {
            throw new HttpError(400, "Tên bài tập cần từ 1 đến 120 ký tự.");
        }
        if (description.length < 1 || description.length > 10000) {
            throw new HttpError(400, "Nội dung bài tập cần từ 1 đến 10.000 ký tự.");
        }
        const { data: assignment, error } = await db
            .from("math_assignments")
            .insert({ title, description, created_by: user.id })
            .select("id, title, description, created_by, created_at, updated_at")
            .single();
        if (error) throw error;
        return res.status(201).json({
            assignment: {
                ...assignment,
                creatorUsername: publicUser(user).username,
                submission: null,
            },
        });
    } catch (error) {
        return sendApiError(res, error, "Lỗi bài tập:");
    }
}
