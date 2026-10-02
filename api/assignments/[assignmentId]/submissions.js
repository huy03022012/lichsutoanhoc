import {
    ensureSameOrigin,
    getDatabase,
    HttpError,
    requireRole,
    requireUser,
    sendApiError,
} from "../../../src/services/accountAuth.js";

const STAFF = ["teacher", "admin", "super_admin"];

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const db = getDatabase();
        const user = await requireUser(db, req);
        const assignmentId =
            req.params?.assignmentId ?? req.query?.assignmentId;
        const { data: assignment, error: assignmentError } = await db
            .from("math_assignments")
            .select("id, created_by, assignment_type, quiz_questions")
            .eq("id", assignmentId)
            .maybeSingle();
        if (assignmentError) throw assignmentError;
        if (!assignment) throw new HttpError(404, "Không tìm thấy bài tập.");

        if (req.method === "POST") {
            ensureSameOrigin(req);
            requireRole(user, ["student"]);
            let answer;
            let autoScore = null;
            let autoMaxScore = null;
            if (assignment.assignment_type === "multiple_choice" ||
                assignment.assignment_type === "mixed") {
                const answers = req.body?.answers;
                if (
                    !Array.isArray(answers) ||
                    answers.length !== assignment.quiz_questions.length
                ) {
                    throw new HttpError(400, "Hãy trả lời đầy đủ các câu hỏi.");
                }
                let score = 0;
                let maxScore = 0;
                for (const [index, question] of assignment.quiz_questions.entries()) {
                    const response = answers[index];
                    if (question.type === "multiple_choice") {
                        if (
                            !Number.isInteger(response) ||
                            response < 0 ||
                            response >= question.options.length
                        ) {
                            throw new HttpError(400, "Hãy chọn đáp án cho từng câu trắc nghiệm.");
                        }
                        maxScore += question.points;
                        if (response === question.correctOptionIndex) score += question.points;
                    } else if (typeof response !== "string" || !response.trim() || response.length > 10000) {
                        throw new HttpError(400, "Hãy hoàn thành từng câu tự luận (tối đa 10.000 ký tự).");
                    }
                }
                autoScore = Math.round(score * 100) / 100;
                autoMaxScore = Math.round(maxScore * 100) / 100;
                answer = JSON.stringify({ answers });
                if (answer.length > 10000) {
                    throw new HttpError(400, "Câu trả lời quá dài.");
                }
            } else {
                answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
                if (!answer || answer.length > 10000) {
                    throw new HttpError(400, "Câu trả lời cần từ 1 đến 10.000 ký tự.");
                }
            }
            const { data: existingSubmission, error: existingError } = await db
                .from("math_submissions")
                .select("teacher_feedback")
                .eq("assignment_id", assignmentId)
                .eq("student_id", user.id)
                .maybeSingle();
            if (existingError) throw existingError;
            if (existingSubmission?.teacher_feedback) {
                throw new HttpError(
                    409,
                    "Bài đã được giáo viên nhận xét nên không thể sửa câu trả lời.",
                );
            }
            const { data: submission, error } = await db
                .from("math_submissions")
                .upsert(
                    {
                        assignment_id: assignmentId,
                        student_id: user.id,
                        answer,
                        auto_score: autoScore,
                        auto_max_score: autoMaxScore,
                        teacher_feedback: null,
                        reviewed_by: null,
                        submitted_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "assignment_id,student_id" },
                )
                .select("id, answer, teacher_feedback, auto_score, auto_max_score, submitted_at, updated_at")
                .single();
            if (error) throw error;
            return res.status(200).json({ submission });
        }

        if (req.method === "GET") {
            if (user.role === "student") {
                const { data, error } = await db
                    .from("math_submissions")
                    .select("id, answer, teacher_feedback, auto_score, auto_max_score, submitted_at, updated_at")
                    .eq("assignment_id", assignmentId)
                    .eq("student_id", user.id)
                    .maybeSingle();
                if (error) throw error;
                return res.status(200).json({ submissions: data ? [data] : [] });
            }
            requireRole(user, STAFF);
            if (
                user.role === "teacher" &&
                assignment.created_by !== user.id
            ) {
                throw new HttpError(403, "Giáo viên chỉ xem bài nộp cho bài tập của mình.");
            }
            const { data: submissions, error } = await db
                .from("math_submissions")
                .select("id, student_id, answer, auto_score, auto_max_score, teacher_feedback, submitted_at, updated_at")
                .eq("assignment_id", assignmentId)
                .order("submitted_at", { ascending: false });
            if (error) throw error;
            const studentIds = [
                ...new Set(submissions.map((submission) => submission.student_id)),
            ];
            const { data: students, error: studentsError } = studentIds.length
                ? await db
                      .from("account_users")
                      .select("id, display_name, username")
                      .in("id", studentIds)
                : { data: [], error: null };
            if (studentsError) throw studentsError;
            const displayNames = new Map(
                students.map((student) => [
                    student.id,
                    student.display_name || student.username,
                ]),
            );
            return res.status(200).json({
                submissions: submissions.map((submission) => ({
                    ...submission,
                    studentUsername:
                        displayNames.get(submission.student_id) ?? "Học sinh",
                })),
            });
        }

        if (req.method === "PATCH") {
            ensureSameOrigin(req);
            requireRole(user, STAFF);
            if (
                user.role === "teacher" &&
                assignment.created_by !== user.id
            ) {
                throw new HttpError(403, "Giáo viên chỉ nhận xét bài nộp cho bài tập của mình.");
            }
            const submissionId = req.body?.submissionId;
            const feedback =
                typeof req.body?.feedback === "string"
                    ? req.body.feedback.trim()
                    : "";
            if (
                typeof submissionId !== "string" ||
                !/^[0-9a-f-]{36}$/i.test(submissionId)
            ) {
                throw new HttpError(400, "Bài nộp được chọn không hợp lệ.");
            }
            if (feedback.length > 4000) {
                throw new HttpError(400, "Nhận xét không được dài quá 4.000 ký tự.");
            }
            const { data: submission, error } = await db
                .from("math_submissions")
                .update({
                    teacher_feedback: feedback || null,
                    reviewed_by: feedback ? user.id : null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", submissionId)
                .eq("assignment_id", assignmentId)
                .select("id, teacher_feedback, updated_at")
                .maybeSingle();
            if (error) throw error;
            if (!submission) throw new HttpError(404, "Không tìm thấy bài nộp.");
            return res.status(200).json({ submission });
        }

        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
    } catch (error) {
        return sendApiError(res, error, "Lỗi bài nộp:");
    }
}
