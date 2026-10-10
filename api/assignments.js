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
const ASSIGNMENT_TYPES = new Set(["multiple_choice", "written", "mixed"]);

// Chuẩn hóa dữ liệu câu hỏi trước khi lưu để các handler đọc, chấm và hiển thị
// cùng một cấu trúc, đồng thời không tin điểm hay chỉ số đáp án do client gửi.
export function validateQuizQuestions(value, assignmentType, pointsMode, commonPoints) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
        throw new HttpError(400, "Bài cần có từ 1 đến 50 câu hỏi.");
    }
    const questions = value.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new HttpError(400, "Thông tin câu hỏi không hợp lệ.");
        }
        const type = assignmentType === "multiple_choice"
            ? "multiple_choice"
            : item.type;
        const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
        if (!["multiple_choice", "written"].includes(type) || !prompt || prompt.length > 2000) {
            throw new HttpError(400, "Mỗi câu hỏi cần có nội dung từ 1 đến 2.000 ký tự.");
        }
        const points = pointsMode === "equal"
            ? Number(commonPoints)
            : Number(item.points);
        if (!Number.isFinite(points) || points <= 0 || points > 10) {
            throw new HttpError(400, "Điểm mỗi câu phải lớn hơn 0 và tối đa là 10.");
        }
        if (type === "written") {
            const answerKey =
                typeof item.answerKey === "string" ? item.answerKey.trim() : "";
            if (!answerKey || answerKey.length > 10000) {
                throw new HttpError(
                    400,
                    "Mỗi câu tự luận cần đáp án tham khảo từ 1 đến 10.000 ký tự.",
                );
            }
            return {
                type,
                prompt,
                answerKey,
                points: Math.round(points * 100) / 100,
            };
        }

        if (
            !Array.isArray(item.options) ||
            item.options.length < 2 ||
            item.options.length > 10 ||
            item.options.some(
                (option) =>
                    typeof option !== "string" ||
                    !option.trim() ||
                    option.trim().length > 500,
            )
        ) {
            throw new HttpError(400, "Mỗi câu trắc nghiệm cần từ 2 đến 10 lựa chọn.");
        }
        if (
            !Number.isInteger(item.correctOptionIndex) ||
            item.correctOptionIndex < 0 ||
            item.correctOptionIndex >= item.options.length
        ) {
            throw new HttpError(400, "Hãy chọn đáp án đúng cho từng câu trắc nghiệm.");
        }
        return {
            type,
            prompt,
            options: item.options.map((option) => option.trim()),
            correctOptionIndex: item.correctOptionIndex,
            points: Math.round(points * 100) / 100,
        };
    });
    const multipleChoiceQuestions = questions.filter(
        (question) => question.type === "multiple_choice",
    );
    if (assignmentType === "multiple_choice" && !multipleChoiceQuestions.length) {
        throw new HttpError(400, "Bài cần có ít nhất một câu trắc nghiệm.");
    }
    if (
        assignmentType === "written" &&
        questions.some((question) => question.type !== "written")
    ) {
        throw new HttpError(400, "Bài tự luận chỉ được chứa câu tự luận.");
    }
    if (
        assignmentType === "mixed" &&
        (!multipleChoiceQuestions.length ||
            !questions.some((question) => question.type === "written"))
    ) {
        throw new HttpError(400, "Bài tổng hợp cần có cả câu trắc nghiệm và câu tự luận.");
    }
    const totalPoints = Math.round(
        questions.reduce((total, question) => total + question.points, 0) * 100,
    );
    if (totalPoints !== 1000) {
        throw new HttpError(
            400,
            `Tổng điểm tối đa hiện là ${(totalPoints / 100).toFixed(2)}; tổng điểm tối đa phải là 10.`,
        );
    }
    return questions;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const db = getDatabase();
        const user = await requireUser(db, req);

        if (req.method === "GET") {
            // Trả lời đúng và đáp án tham khảo chỉ hiện với nhân viên; học sinh
            // nhận bản sao đã loại bỏ các trường có thể làm lộ đáp án.
            const { data: assignments, error } = await db
                .from("math_assignments")
                .select("id, title, description, created_by, assignment_type, quiz_questions, created_at, updated_at")
                .order("created_at", { ascending: false });
            if (error) throw error;
            const ownerIds = [
                ...new Set(assignments.map((assignment) => assignment.created_by)),
            ];
            const { data: owners, error: ownerError } = ownerIds.length
                ? await db
                      .from("account_users")
                      .select("id, display_name, username")
                      .in("id", ownerIds)
                : { data: [], error: null };
            if (ownerError) throw ownerError;
            const displayNames = new Map(
                owners.map((owner) => [
                    owner.id,
                    owner.display_name || owner.username,
                ]),
            );
            const visibleAssignments = assignments.map((assignment) => ({
                ...assignment,
                quiz_questions:
                    user.role === "student"
                        ? assignment.quiz_questions.map(
                              ({
                                  correctOptionIndex,
                                  answerKey,
                                  ...question
                              }) => question,
                          )
                        : assignment.quiz_questions,
            }));
            const { data: ownSubmissions, error: submissionError } = await db
                .from("math_submissions")
                .select("assignment_id, answer, teacher_feedback, auto_score, auto_max_score, auto_feedback, teacher_score, submitted_at, updated_at")
                .eq("student_id", user.id);
            if (submissionError) throw submissionError;
            const submissions = new Map(
                ownSubmissions.map((submission) => [
                    submission.assignment_id,
                    submission,
                ]),
            );
            return res.status(200).json({
                assignments: visibleAssignments.map((assignment) => ({
                    ...assignment,
                    creatorUsername:
                        displayNames.get(assignment.created_by) ?? "Giáo viên",
                    submission: submissions.get(assignment.id) ?? null,
                })),
            });
        }

        if (req.method === "DELETE") {
            ensureSameOrigin(req);
            requireRole(user, CREATORS);
            const assignmentId = req.query?.assignmentId;
            if (
                typeof assignmentId !== "string" ||
                !/^[0-9a-f-]{36}$/i.test(assignmentId)
            ) {
                throw new HttpError(400, "Bài tập được chọn không hợp lệ.");
            }
            const { data: assignment, error: lookupError } = await db
                .from("math_assignments")
                .select("id, created_by")
                .eq("id", assignmentId)
                .maybeSingle();
            if (lookupError) throw lookupError;
            if (!assignment) throw new HttpError(404, "Không tìm thấy bài tập.");
            if (user.role === "teacher" && assignment.created_by !== user.id) {
                throw new HttpError(403, "Giáo viên chỉ được xóa bài tập do mình tạo.");
            }
            const { error: deleteError } = await db
                .from("math_assignments")
                .delete()
                .eq("id", assignmentId);
            if (deleteError) throw deleteError;
            return res.status(200).json({ deletedAssignmentId: assignmentId });
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST, DELETE");
            return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
        }
        ensureSameOrigin(req);
        // Chỉ nhóm nhân viên được tạo bài; ensureSameOrigin ngăn request thay đổi
        // dữ liệu được kích hoạt từ một origin không tin cậy bằng cookie phiên.
        requireRole(user, CREATORS);
        const title =
            typeof req.body?.title === "string" ? req.body.title.trim() : "";
        const description =
            typeof req.body?.description === "string"
                ? req.body.description.trim()
                : "";
        const assignmentType = req.body?.assignmentType;
        if (!ASSIGNMENT_TYPES.has(assignmentType)) {
            throw new HttpError(400, "Loại bài tập không hợp lệ.");
        }
        const pointsMode = req.body?.pointsMode;
        if (!["equal", "custom"].includes(pointsMode)) {
            throw new HttpError(400, "Cách tính điểm không hợp lệ.");
        }
        const commonPoints = req.body?.commonPoints;
        const quizQuestions = validateQuizQuestions(
            req.body?.quizQuestions,
            assignmentType,
            pointsMode,
            commonPoints,
        );
        if (title.length < 1 || title.length > 120) {
            throw new HttpError(400, "Tên bài tập cần từ 1 đến 120 ký tự.");
        }
        if (description.length < 1 || description.length > 10000) {
            throw new HttpError(400, "Nội dung bài tập cần từ 1 đến 10.000 ký tự.");
        }
        const { data: assignment, error } = await db
            .from("math_assignments")
            .insert({
                title,
                description,
                created_by: user.id,
                assignment_type: assignmentType,
                quiz_questions: quizQuestions,
            })
            .select("id, title, description, created_by, assignment_type, quiz_questions, created_at, updated_at")
            .single();
        if (error) throw error;
        return res.status(201).json({
            assignment: {
                ...assignment,
                creatorUsername: publicUser(user).displayName,
                submission: null,
            },
        });
    } catch (error) {
        return sendApiError(res, error, "Lỗi bài tập:");
    }
}
