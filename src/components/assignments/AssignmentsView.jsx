import { useEffect, useState } from "react";
import {
    createAssignment,
    getAssignmentSubmissions,
    getAssignments,
    reviewAssignmentSubmission,
    submitAssignmentAnswer,
} from "../../services/api.js";

const STAFF_ROLES = ["teacher", "admin", "super_admin"];

function SubmissionReview({ assignment, onError }) {
    const [submissions, setSubmissions] = useState([]);
    const [feedbackDrafts, setFeedbackDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState("");

    useEffect(() => {
        let active = true;
        getAssignmentSubmissions(assignment.id)
            .then(({ submissions: data }) => {
                if (!active) return;
                setSubmissions(data);
                setFeedbackDrafts(
                    Object.fromEntries(
                        data.map((submission) => [
                            submission.id,
                            submission.teacher_feedback ?? "",
                        ]),
                    ),
                );
            })
            .catch((error) => onError(error.message))
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [assignment.id, onError]);

    async function saveFeedback(submissionId) {
        setSavingId(submissionId);
        onError("");
        try {
            const { submission } = await reviewAssignmentSubmission(
                assignment.id,
                submissionId,
                feedbackDrafts[submissionId] ?? "",
            );
            setSubmissions((current) =>
                current.map((item) =>
                    item.id === submissionId
                        ? { ...item, teacher_feedback: submission.teacher_feedback }
                        : item,
                ),
            );
        } catch (error) {
            onError(error.message);
        } finally {
            setSavingId("");
        }
    }

    if (loading) return <p className="muted">Đang tải bài nộp…</p>;
    if (!submissions.length) {
        return <p className="muted">Chưa có học sinh nộp bài tập này.</p>;
    }

    return (
        <div className="submissionList">
            {submissions.map((submission) => (
                <article className="submissionCard" key={submission.id}>
                    <h4>{submission.studentUsername}</h4>
                    <p className="submissionAnswer">{submission.answer}</p>
                    <label>
                        Nhận xét của giáo viên
                        <textarea
                            maxLength={4000}
                            value={feedbackDrafts[submission.id] ?? ""}
                            onChange={(event) =>
                                setFeedbackDrafts((current) => ({
                                    ...current,
                                    [submission.id]: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <button
                        className="secondary"
                        type="button"
                        onClick={() => saveFeedback(submission.id)}
                        disabled={savingId === submission.id}
                    >
                        {savingId === submission.id
                            ? "Đang lưu…"
                            : "Lưu nhận xét"}
                    </button>
                </article>
            ))}
        </div>
    );
}

export default function AssignmentsView({ user }) {
    const [assignments, setAssignments] = useState([]);
    const [answers, setAnswers] = useState({});
    const [expandedId, setExpandedId] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [savingId, setSavingId] = useState("");
    const canCreate = STAFF_ROLES.includes(user?.role);
    const canReview = user && STAFF_ROLES.includes(user.role);

    async function loadAssignments() {
        setLoading(true);
        setError("");
        try {
            const result = await getAssignments();
            setAssignments(result.assignments);
            setAnswers(
                Object.fromEntries(
                    result.assignments.map((item) => [
                        item.id,
                        item.submission?.answer ?? "",
                    ]),
                ),
            );
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAssignments();
    }, [user?.id]);

    async function create(event) {
        event.preventDefault();
        setCreating(true);
        setError("");
        try {
            const { assignment } = await createAssignment(title, description);
            setAssignments((current) => [assignment, ...current]);
            setTitle("");
            setDescription("");
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setCreating(false);
        }
    }

    async function submitAnswer(assignmentId) {
        setSavingId(assignmentId);
        setError("");
        try {
            const { submission } = await submitAssignmentAnswer(
                assignmentId,
                answers[assignmentId] ?? "",
            );
            setAssignments((current) =>
                current.map((assignment) =>
                    assignment.id === assignmentId
                        ? { ...assignment, submission }
                        : assignment,
                ),
            );
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setSavingId("");
        }
    }

    return (
        <section className="view active">
            <div className="sectionHeader">
                <div>
                    <span className="tag">Luyện tập</span>
                    <h1>Bài tập Toán học</h1>
                    <p className="muted">
                        {canCreate
                            ? "Tạo bài tập và theo dõi phần làm của học sinh."
                            : "Chọn bài tập, trình bày cách làm rồi gửi cho giáo viên."}
                    </p>
                </div>
                <button
                    className="secondary"
                    type="button"
                    onClick={loadAssignments}
                    disabled={loading}
                >
                    Làm mới
                </button>
            </div>
            {!user && (
                <p className="authNotice" role="status">
                    Đăng nhập để làm và nộp bài tập.
                </p>
            )}
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            {canCreate && (
                <form className="assignmentForm card" onSubmit={create}>
                    <h2>Tạo bài tập mới</h2>
                    <label>
                        Tên bài tập
                        <input
                            maxLength={120}
                            required
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Ví dụ: Phương trình bậc hai"
                        />
                    </label>
                    <label>
                        Đề bài và hướng dẫn
                        <textarea
                            maxLength={10000}
                            required
                            value={description}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            placeholder="Nhập đề bài Toán học…"
                        />
                    </label>
                    <button className="primary" disabled={creating}>
                        {creating ? "Đang tạo…" : "Đăng bài tập"}
                    </button>
                </form>
            )}
            {loading ? (
                <p className="muted">Đang tải bài tập…</p>
            ) : assignments.length ? (
                <div className="assignmentList">
                    {assignments.map((assignment) => (
                        <article className="assignmentCard card" key={assignment.id}>
                            <div className="assignmentMeta">
                                <span className="tag">
                                    Người tạo: {assignment.creatorUsername}
                                </span>
                                <small>
                                    {new Date(assignment.created_at).toLocaleDateString(
                                        "vi-VN",
                                    )}
                                </small>
                            </div>
                            <h2>{assignment.title}</h2>
                            <p className="assignmentDescription">
                                {assignment.description}
                            </p>
                            {user?.role === "student" && (
                                <div className="studentAnswer">
                                    <label>
                                        Bài làm của em
                                        <textarea
                                            maxLength={10000}
                                            value={answers[assignment.id] ?? ""}
                                            onChange={(event) =>
                                                setAnswers((current) => ({
                                                    ...current,
                                                    [assignment.id]:
                                                        event.target.value,
                                                }))
                                            }
                                            placeholder="Trình bày các bước làm…"
                                            disabled={Boolean(
                                                assignment.submission?.teacher_feedback,
                                            )}
                                        />
                                    </label>
                                    <button
                                        className="primary"
                                        type="button"
                                        onClick={() =>
                                            submitAnswer(assignment.id)
                                        }
                                        disabled={
                                            savingId === assignment.id ||
                                            Boolean(
                                                assignment.submission?.teacher_feedback,
                                            )
                                        }
                                    >
                                        {savingId === assignment.id
                                            ? "Đang nộp…"
                                            : assignment.submission
                                              ? "Cập nhật bài làm"
                                              : "Nộp bài"}
                                    </button>
                                    {assignment.submission?.teacher_feedback && (
                                        <div className="teacherFeedback">
                                            <strong>Nhận xét của giáo viên</strong>
                                            <p>
                                                {assignment.submission.teacher_feedback}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {canReview && (
                                (user.role !== "teacher" ||
                                    assignment.created_by === user.id) && (
                                    <button
                                        className="secondary"
                                        type="button"
                                        onClick={() =>
                                            setExpandedId((current) =>
                                                current === assignment.id
                                                    ? ""
                                                    : assignment.id,
                                            )
                                        }
                                    >
                                        {expandedId === assignment.id
                                            ? "Ẩn bài nộp"
                                            : "Xem bài nộp và nhận xét"}
                                    </button>
                                )
                            )}
                            {canReview && expandedId === assignment.id && (
                                <SubmissionReview
                                    assignment={assignment}
                                    onError={setError}
                                />
                            )}
                        </article>
                    ))}
                </div>
            ) : (
                <div className="card empty">
                    Chưa có bài tập nào được đăng.
                </div>
            )}
        </section>
    );
}
