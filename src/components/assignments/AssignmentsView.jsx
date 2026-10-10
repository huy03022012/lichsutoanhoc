import { useEffect, useState } from "react";
import {
    createAssignment,
    deleteAssignment,
    getAssignmentSubmissions,
    getAssignments,
    reviewAssignmentSubmission,
    submitAssignmentAnswer,
} from "../../services/api.js";

const STAFF_ROLES = ["teacher", "admin", "super_admin"];
const ASSIGNMENT_TYPES = [
    ["multiple_choice", "Trắc nghiệm"],
    ["written", "Tự luận"],
    ["mixed", "Tổng hợp"],
];

function createQuestion(type = "multiple_choice") {
    return {
        type,
        prompt: "",
        options: ["", "", "", ""],
        correctOptionIndex: 0,
        answerKey: "",
        points: 0,
    };
}

function readStructuredAnswer(answer) {
    try {
        const parsed = JSON.parse(answer);
        return Array.isArray(parsed.answers) ? parsed.answers : [];
    } catch {
        return [];
    }
}

function totalQuizPoints(questions, pointsMode, commonPoints) {
    const points = questions.reduce(
        (total, question) =>
            total +
            Number(pointsMode === "equal" ? commonPoints : question.points || 0),
        0,
    );
    return Math.round(points * 100) / 100;
}

function hasSubmitted(submission) {
    return Boolean(submission);
}

// Bảng xem xét bài nộp của giáo viên: mỗi bài nộp có bộ nhớ riêng cho nhận xét và
// điểm chấm, đồng thời fetch dữ liệu khi mount để hiển thị đáp án, nhận xét AI và
// kết quả chấm từ phía giáo viên. Đối với bài trắc nghiệm, đáp án được parse từ
// JSON lưu trong `submission.answer` để map trực tiếp với câu hỏi.
function SubmissionReview({ assignment, onError }) {
    const [submissions, setSubmissions] = useState([]);
    const [feedbackDrafts, setFeedbackDrafts] = useState({});
    const [scoreDrafts, setScoreDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState("");
    const [gradingId, setGradingId] = useState("");

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
                setScoreDrafts(
                    Object.fromEntries(
                        data.map((submission) => [
                            submission.id,
                            submission.teacher_score ??
                                submission.auto_score ??
                                "",
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

    async function saveGrade(submissionId) {
        if (
            scoreDrafts[submissionId] === "" ||
            !Number.isFinite(Number(scoreDrafts[submissionId]))
        ) {
            onError("Hãy nhập điểm giáo viên chấm hợp lệ.");
            return;
        }
        const teacherScore = Number(scoreDrafts[submissionId]);
        setGradingId(submissionId);
        onError("");
        try {
            const { submission } = await reviewAssignmentSubmission(
                assignment.id,
                submissionId,
                undefined,
                teacherScore,
            );
            setSubmissions((current) =>
                current.map((item) =>
                    item.id === submissionId
                        ? { ...item, teacher_score: submission.teacher_score }
                        : item,
                ),
            );
        } catch (error) {
            onError(error.message);
        } finally {
            setGradingId("");
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
                    {assignment.quiz_questions?.length ? (
                        <div className="submissionAnswerList">
                            {readStructuredAnswer(submission.answer).map(
                                (response, index) => {
                                    const question = assignment.quiz_questions[index];
                                    if (!question) return null;
                                    const responseText =
                                        question.type === "multiple_choice"
                                            ? question.options[response] ??
                                              "Chưa trả lời"
                                            : response || "Chưa trả lời";
                                    return (
                                        <div key={`${submission.id}-${index}`}>
                                            <strong>
                                                Câu {index + 1}: {question.prompt}
                                            </strong>
                                            <p>Học sinh trả lời: {responseText}</p>
                                            {question.type === "multiple_choice" && (
                                                <p className="muted">
                                                    Đáp án đúng:{" "}
                                                    {question.options[
                                                        question.correctOptionIndex
                                                    ]}
                                                </p>
                                            )}
                                            {question.type === "written" && (
                                                <>
                                                    <p className="muted submissionAnswer">
                                                        Đáp án tham khảo: {question.answerKey}
                                                    </p>
                                                    {submission.auto_feedback?.find(
                                                        (item) =>
                                                            item.questionIndex === index,
                                                    )?.feedback && (
                                                        <p className="muted">
                                                            Nhận xét AI:{" "}
                                                            {
                                                                submission.auto_feedback.find(
                                                                    (item) =>
                                                                        item.questionIndex ===
                                                                        index,
                                                                ).feedback
                                                            }
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    ) : (
                        <p className="submissionAnswer">{submission.answer}</p>
                    )}
                    {submission.auto_score !== null &&
                        submission.auto_score !== undefined && (
                            <p className="assignmentScore">
                                Điểm AI: {submission.auto_score}/
                                {submission.auto_max_score}
                            </p>
                        )}
                    {submission.auto_score !== null &&
                        submission.auto_score !== undefined && (
                            <>
                                <label>
                                    Điểm giáo viên chấm lại
                                    <input
                                        type="number"
                                        min="0"
                                        max={submission.auto_max_score}
                                        step="0.01"
                                        value={scoreDrafts[submission.id] ?? ""}
                                        onChange={(event) =>
                                            setScoreDrafts((current) => ({
                                                ...current,
                                                [submission.id]: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <button
                                    className="secondary"
                                    type="button"
                                    onClick={() => saveGrade(submission.id)}
                                    disabled={gradingId === submission.id}
                                >
                                    {gradingId === submission.id
                                        ? "Đang lưu điểm…"
                                        : "Lưu điểm giáo viên"}
                                </button>
                            </>
                        )}
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

// Giao diện quản lý bài tập tập trung vào hai vai trò: người tạo/giáo viên review và
// người học nộp bài. Chức năng `create`/`submitAnswer`/`removeAssignment` cập nhật
// cùng một mảng state `assignments`, nên các thay đổi phải được đồng bộ ngay để
// phản ánh đúng trạng thái nộp và quyền xem của từng người dùng.
export default function AssignmentsView({ user }) {
    const [assignments, setAssignments] = useState([]);
    const [answers, setAnswers] = useState({});
    const [expandedId, setExpandedId] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [assignmentType, setAssignmentType] = useState("written");
    const [questions, setQuestions] = useState([
        createQuestion("written"),
    ]);
    const [pointsMode, setPointsMode] = useState("equal");
    const [commonPoints, setCommonPoints] = useState("10");
    const [savingId, setSavingId] = useState("");
    const [deletingId, setDeletingId] = useState("");
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
                            item.quiz_questions?.length
                                ? readStructuredAnswer(item.submission?.answer)
                            : item.submission?.answer ?? "",
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

    // Tạo đề bài yêu cầu tổng điểm tối đa phải bằng 10, nếu không sẽ dừng ngay trước
    // khi gọi API. Đây là validation quan trọng vì `pointsMode` và `questions` có thể
    // được chỉnh bằng nhiều cách và cần đồng bộ điểm trước khi lưu.
    async function create(event) {
        event.preventDefault();
        setCreating(true);
        setError("");
        if (totalQuizPoints(questions, pointsMode, commonPoints) !== 10) {
            setError("Tổng điểm tối đa phải là 10. Hãy sửa điểm các câu.");
            setCreating(false);
            return;
        }
        try {
            const { assignment } = await createAssignment(
                title,
                description,
                assignmentType,
                pointsMode,
                Number(commonPoints),
                questions,
            );
            setAssignments((current) => [assignment, ...current]);
            setTitle("");
            setDescription("");
            setAssignmentType("written");
            setQuestions([createQuestion("written")]);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setCreating(false);
        }
    }

    // submitAnswer đồng bộ trạng thái bài làm ở client: nó lấy câu trả lời hiện tại
    // của assignment, gửi lên backend và cập nhật lại `assignments` với `submission`
    // mới, nên người dùng thấy kết quả nộp ngay mà không cần reload.
    async function submitAnswer(assignmentId) {
        setSavingId(assignmentId);
        setError("");
        try {
            const assignment = assignments.find((item) => item.id === assignmentId);
            const { submission } = await submitAssignmentAnswer(
                assignmentId,
                assignment?.quiz_questions?.length ? "" : answers[assignmentId] ?? "",
                assignment?.quiz_questions?.length
                    ? answers[assignmentId] ?? []
                    : undefined,
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

    async function removeAssignment(assignment) {
        const confirmed = globalThis.confirm(
            `Xóa bài tập "${assignment.title}"? Bài nộp của học sinh cũng sẽ bị xóa và thao tác này không thể hoàn tác.`,
        );
        if (!confirmed) return;

        setDeletingId(assignment.id);
        setError("");
        try {
            await deleteAssignment(assignment.id);
            setAssignments((current) =>
                current.filter((item) => item.id !== assignment.id),
            );
            setExpandedId((current) =>
                current === assignment.id ? "" : current,
            );
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setDeletingId("");
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
                    className="primary"
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
                    <label>
                        Loại bài tập
                        <select
                            value={assignmentType}
                            onChange={(event) => {
                                const nextType = event.target.value;
                                setAssignmentType(nextType);
                                setQuestions(
                                    nextType === "mixed"
                                        ? [
                                              createQuestion("multiple_choice"),
                                              createQuestion("written"),
                                          ]
                                        : [
                                              createQuestion(
                                                  nextType === "written"
                                                      ? "written"
                                                      : "multiple_choice",
                                              ),
                                          ],
                                );
                            }}
                        >
                            {ASSIGNMENT_TYPES.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <section className="quizBuilder" aria-label="Câu hỏi bài tập">
                            <h3>Câu hỏi và đáp án</h3>
                            <p className="muted">
                                Tổng điểm bài phải đúng 10. Đáp án và đáp án tham
                                khảo được giữ riêng, không hiển thị cho học sinh
                                trước khi nộp.
                            </p>
                            <label>
                                Cách chia điểm
                                <select
                                    value={pointsMode}
                                    onChange={(event) =>
                                        setPointsMode(event.target.value)
                                    }
                                >
                                    <option value="equal">
                                        Cùng điểm cho mỗi câu
                                    </option>
                                    <option value="custom">
                                        Tự đặt điểm mỗi câu
                                    </option>
                                </select>
                            </label>
                            {pointsMode === "equal" && (
                                <label>
                                    Điểm mỗi câu
                                    <input
                                        type="number"
                                        min="0.01"
                                        max="10"
                                        step="0.01"
                                        value={commonPoints}
                                        onChange={(event) =>
                                            setCommonPoints(event.target.value)
                                        }
                                    />
                                </label>
                            )}
                            <p
                                className={
                                    totalQuizPoints(
                                        questions,
                                        pointsMode,
                                        commonPoints,
                                    ) === 10
                                        ? "assignmentScore"
                                        : "error"
                                }
                                role="status"
                            >
                                Tổng điểm tối đa:{" "}
                                {totalQuizPoints(
                                    questions,
                                    pointsMode,
                                    commonPoints,
                                ).toFixed(2)}
                                /10
                            </p>
                            {totalQuizPoints(
                                questions,
                                pointsMode,
                                commonPoints,
                            ) !== 10 && (
                                <p className="error" role="alert">
                                    Tổng điểm tối đa phải là 10 trước khi đăng bài.
                                </p>
                            )}
                            {questions.map((question, questionIndex) => (
                                <fieldset
                                    className="quizQuestionEditor"
                                    key={questionIndex}
                                >
                                    <legend>Câu {questionIndex + 1}</legend>
                                    {assignmentType === "mixed" && (
                                        <label>
                                            Dạng câu
                                            <select
                                                value={question.type}
                                                onChange={(event) =>
                                                    setQuestions((current) =>
                                                        current.map((item, index) =>
                                                            index === questionIndex
                                                                ? {
                                                                      ...createQuestion(
                                                                          event.target.value,
                                                                      ),
                                                                      prompt: item.prompt,
                                                                  }
                                                                : item,
                                                        ),
                                                    )
                                                }
                                            >
                                                <option value="multiple_choice">
                                                    Trắc nghiệm
                                                </option>
                                                <option value="written">
                                                    Tự luận
                                                </option>
                                            </select>
                                        </label>
                                    )}
                                    <label>
                                        Nội dung câu hỏi
                                        <textarea
                                            maxLength={2000}
                                            required
                                            value={question.prompt}
                                            onChange={(event) =>
                                                setQuestions((current) =>
                                                    current.map((item, index) =>
                                                        index === questionIndex
                                                            ? {
                                                                  ...item,
                                                                  prompt: event.target.value,
                                                              }
                                                            : item,
                                                    ),
                                                )
                                            }
                                        />
                                    </label>
                                    {question.type === "multiple_choice" ? (
                                        <>
                                            {question.options.map(
                                                (option, optionIndex) => (
                                                    <div
                                                        className="quizOptionEditor"
                                                        key={optionIndex}
                                                    >
                                                        <label>
                                                            Lựa chọn {optionIndex + 1}
                                                            <input
                                                                maxLength={500}
                                                                required
                                                                value={option}
                                                                onChange={(event) =>
                                                                    setQuestions(
                                                                        (current) =>
                                                                            current.map(
                                                                                (
                                                                                    item,
                                                                                    index,
                                                                                ) =>
                                                                                    index ===
                                                                                    questionIndex
                                                                                        ? {
                                                                                              ...item,
                                                                                              options:
                                                                                                  item.options.map(
                                                                                                      (
                                                                                                          value,
                                                                                                          currentIndex,
                                                                                                      ) =>
                                                                                                          currentIndex ===
                                                                                                          optionIndex
                                                                                                              ? event
                                                                                                                    .target
                                                                                                                    .value
                                                                                                              : value,
                                                                                                  ),
                                                                                          }
                                                                                        : item,
                                                                            ),
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                        <label className="correctOptionChoice">
                                                            <input
                                                                type="radio"
                                                                name={`correct-${questionIndex}`}
                                                                checked={
                                                                    question.correctOptionIndex ===
                                                                    optionIndex
                                                                }
                                                                onChange={() =>
                                                                    setQuestions(
                                                                        (current) =>
                                                                            current.map(
                                                                                (
                                                                                    item,
                                                                                    index,
                                                                                ) =>
                                                                                    index ===
                                                                                    questionIndex
                                                                                        ? {
                                                                                              ...item,
                                                                                              correctOptionIndex:
                                                                                                  optionIndex,
                                                                                          }
                                                                                        : item,
                                                                            ),
                                                                    )
                                                                }
                                                            />
                                                            Đáp án đúng
                                                        </label>
                                                        {question.options.length > 2 && (
                                                            <button
                                                                className="secondary"
                                                                type="button"
                                                                onClick={() =>
                                                                    setQuestions(
                                                                        (current) =>
                                                                            current.map(
                                                                                (
                                                                                    item,
                                                                                    index,
                                                                                ) => {
                                                                                    if (
                                                                                        index !==
                                                                                        questionIndex
                                                                                    ) {
                                                                                        return item;
                                                                                    }
                                                                                    const options =
                                                                                        item.options.filter(
                                                                                            (
                                                                                                _,
                                                                                                currentIndex,
                                                                                            ) =>
                                                                                                currentIndex !==
                                                                                                optionIndex,
                                                                                        );
                                                                                    return {
                                                                                        ...item,
                                                                                        options,
                                                                                        correctOptionIndex:
                                                                                            item.correctOptionIndex ===
                                                                                            optionIndex
                                                                                                ? Math.min(
                                                                                                      optionIndex,
                                                                                                      options.length -
                                                                                                          1,
                                                                                                  )
                                                                                                : item.correctOptionIndex >
                                                                                                    optionIndex
                                                                                                  ? item.correctOptionIndex -
                                                                                                    1
                                                                                                  : item.correctOptionIndex,
                                                                                    };
                                                                                },
                                                                            ),
                                                                    )
                                                                }
                                                            >
                                                                Xóa lựa chọn
                                                            </button>
                                                        )}
                                                    </div>
                                                ),
                                            )}
                                            {question.options.length < 10 && (
                                                <button
                                                    className="secondary"
                                                    type="button"
                                                    onClick={() =>
                                                        setQuestions((current) =>
                                                            current.map((item, index) =>
                                                                index === questionIndex
                                                                    ? {
                                                                          ...item,
                                                                          options: [
                                                                              ...item.options,
                                                                              "",
                                                                          ],
                                                                      }
                                                                    : item,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Thêm lựa chọn
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <label>
                                            Đáp án tham khảo để AI chấm
                                            <textarea
                                                maxLength={10000}
                                                required
                                                value={question.answerKey}
                                                onChange={(event) =>
                                                    setQuestions((current) =>
                                                        current.map((item, index) =>
                                                            index === questionIndex
                                                                ? {
                                                                      ...item,
                                                                      answerKey:
                                                                          event.target.value,
                                                                  }
                                                                : item,
                                                        ),
                                                    )
                                                }
                                                placeholder="Nhập đáp án đúng, các bước giải hoặc những ý cần có…"
                                            />
                                        </label>
                                    )}
                                    {pointsMode === "custom" && (
                                        <label>
                                            Điểm câu này
                                            <input
                                                type="number"
                                                min="0.01"
                                                max="10"
                                                step="0.01"
                                                value={question.points}
                                                onChange={(event) =>
                                                    setQuestions((current) =>
                                                        current.map((item, index) =>
                                                            index === questionIndex
                                                                ? {
                                                                      ...item,
                                                                      points: event.target.value,
                                                                  }
                                                                : item,
                                                        ),
                                                    )
                                                }
                                            />
                                        </label>
                                    )}
                                    {questions.length > 1 && (
                                        <button
                                            className="secondary"
                                            type="button"
                                            onClick={() =>
                                                setQuestions((current) =>
                                                    current.filter(
                                                        (_, index) =>
                                                            index !== questionIndex,
                                                    ),
                                                )
                                            }
                                        >
                                            Xóa câu hỏi
                                        </button>
                                    )}
                                </fieldset>
                            ))}
                            <button
                                className="secondary"
                                type="button"
                                disabled={questions.length >= 50}
                                onClick={() =>
                                    setQuestions((current) => [
                                        ...current,
                                        createQuestion(
                                            assignmentType === "multiple_choice"
                                                ? "multiple_choice"
                                                : "written",
                                        ),
                                    ])
                                }
                            >
                                Thêm câu hỏi
                            </button>
                    </section>
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
                                <div className="assignmentCardActions">
                                    <small>
                                        {new Date(assignment.created_at).toLocaleDateString(
                                            "vi-VN",
                                        )}
                                    </small>
                                    {canCreate &&
                                        (user.role !== "teacher" ||
                                            assignment.created_by === user.id) && (
                                            <button
                                                className="secondary dangerButton"
                                                type="button"
                                                onClick={() =>
                                                    removeAssignment(assignment)
                                                }
                                                disabled={
                                                    deletingId === assignment.id
                                                }
                                            >
                                                {deletingId === assignment.id
                                                    ? "Đang xóa…"
                                                    : "Xóa bài tập"}
                                            </button>
                                        )}
                                </div>
                            </div>
                            <h2>{assignment.title}</h2>
                            <p className="assignmentDescription">
                                {assignment.description}
                            </p>
                            <span className="tag">
                                {ASSIGNMENT_TYPES.find(
                                    ([value]) => value === assignment.assignment_type,
                                )?.[1] ?? "Tự luận"}
                            </span>
                            {user?.role === "student" && (
                                <div className="studentAnswer">
                                    {!assignment.quiz_questions?.length ? (
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
                                                disabled={hasSubmitted(
                                                    assignment.submission,
                                                )}
                                            />
                                        </label>
                                    ) : (
                                        assignment.quiz_questions?.map(
                                            (question, questionIndex) => (
                                                <div
                                                    className="studentQuizQuestion"
                                                    key={`${assignment.id}-${questionIndex}`}
                                                >
                                                    <strong>
                                                        Câu {questionIndex + 1}:{" "}
                                                        {question.prompt}
                                                    </strong>
                                                    {question.type ===
                                                    "multiple_choice" ? (
                                                        question.options.map(
                                                            (option, optionIndex) => (
                                                                <label className="quizStudentOption" key={optionIndex}>
                                                                    <input
                                                                        type="radio"
                                                                        name={`${assignment.id}-${questionIndex}`}
                                                                        checked={
                                                                            answers[
                                                                                assignment.id
                                                                            ]?.[
                                                                                questionIndex
                                                                            ] ===
                                                                            optionIndex
                                                                        }
                                                                        disabled={hasSubmitted(
                                                                            assignment.submission,
                                                                        )}
                                                                        onChange={() =>
                                                                            setAnswers(
                                                                                (current) => {
                                                                                    const responses =
                                                                                        current[
                                                                                            assignment.id
                                                                                        ] ?? [];
                                                                                    const next =
                                                                                        [...responses];
                                                                                    next[
                                                                                        questionIndex
                                                                                    ] =
                                                                                        optionIndex;
                                                                                    return {
                                                                                        ...current,
                                                                                        [assignment.id]:
                                                                                            next,
                                                                                    };
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                    {option}
                                                                </label>
                                                            ),
                                                        )
                                                    ) : (
                                                        <textarea
                                                            maxLength={10000}
                                                            value={
                                                                answers[
                                                                    assignment.id
                                                                ]?.[questionIndex] ?? ""
                                                            }
                                                            placeholder="Nhập câu trả lời tự luận…"
                                                            disabled={hasSubmitted(
                                                                assignment.submission,
                                                            )}
                                                            onChange={(event) =>
                                                                setAnswers(
                                                                    (current) => {
                                                                        const responses =
                                                                            current[
                                                                                assignment.id
                                                                            ] ?? [];
                                                                        const next = [
                                                                            ...responses,
                                                                        ];
                                                                        next[
                                                                            questionIndex
                                                                        ] =
                                                                            event.target.value;
                                                                        return {
                                                                            ...current,
                                                                            [assignment.id]:
                                                                                next,
                                                                        };
                                                                    },
                                                                )
                                                            }
                                                        />
                                                    )}
                                                </div>
                                            ),
                                        )
                                    )}
                                    <button
                                        className="primary"
                                        type="button"
                                        onClick={() =>
                                            submitAnswer(assignment.id)
                                        }
                                        disabled={
                                            savingId === assignment.id ||
                                            hasSubmitted(assignment.submission)
                                        }
                                    >
                                        {savingId === assignment.id
                                            ? "Đang nộp…"
                                            : hasSubmitted(assignment.submission)
                                              ? "Đã nộp bài"
                                              : "Nộp bài"}
                                    </button>
                                    {assignment.submission?.auto_score !==
                                        null &&
                                        assignment.submission?.auto_score !==
                                            undefined && (
                                            <div className="teacherFeedback assignmentScore">
                                                <strong>
                                                    Điểm bài:{" "}
                                                    {assignment.submission.teacher_score ??
                                                        assignment.submission.auto_score}/
                                                    {assignment.submission.auto_max_score}
                                                </strong>
                                                {assignment.quiz_questions?.some(
                                                    (question) =>
                                                        question.type === "written",
                                                ) && (
                                                    <p>
                                                        Điểm AI là gợi ý; giáo viên
                                                        có thể chấm lại.
                                                    </p>
                                                )}
                                                {assignment.submission.auto_feedback?.map(
                                                    (item) => (
                                                        <p key={item.questionIndex}>
                                                            Câu {item.questionIndex + 1} — AI:{" "}
                                                            {item.feedback}
                                                        </p>
                                                    ),
                                                )}
                                            </div>
                                        )}
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
