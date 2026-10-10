// Trong production gọi cùng domain (/api); khi cần có thể trỏ sang backend khác.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// Dùng chung cho mọi API để đọc lỗi từ backend và chuyển thành lỗi dễ hiển thị.
// Body JSON lỗi hoặc rỗng vẫn được chuẩn hóa thành object; mã trạng thái HTTP được
// giữ nguyên trong phản hồi fetch nhưng giao diện nhận Error với thông báo API.
async function request(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(data.error || "Không thể kết nối máy chủ.");
    return data;
}

// Lấy bài học, timeline và câu hỏi quiz để dựng giao diện.
export function getContent() {
    return request("/content");
}

export function createLibraryLesson(lesson) {
    return request("/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lesson),
    });
}

// Các hàm tiến độ còn được giữ để bật lại khi có lưu trữ bền vững.
export function getProgress() {
    return request("/progress");
}

export function completeLesson(lessonId) {
    return request(`/progress/lessons/${encodeURIComponent(lessonId)}`, {
        method: "POST",
    });
}

export function submitQuiz(selectedOption) {
    return request("/progress/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOption }),
    });
}

// Các endpoint tài khoản dựa trên cookie phiên HttpOnly; trình duyệt không tự
// ghép token vào payload, chỉ gửi hành động và dữ liệu cần thiết.
export function getAccount() {
    return request("/auth", { signal: AbortSignal.timeout(12000) }).catch(
        (error) => {
            if (error.name === "TimeoutError") {
                throw new Error(
                    "Máy chủ xác thực phản hồi quá lâu. Hãy kiểm tra kết nối và thử tải lại trang.",
                );
            }
            throw error;
        },
    );
}

export function submitAccountAction(action, credentials = {}) {
    return request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...credentials }),
    });
}

export function changeAccountPassword(
    currentPassword,
    newPassword,
    passwordConfirmation,
) {
    return submitAccountAction("change-password", {
        currentPassword,
        newPassword,
        passwordConfirmation,
    });
}

// Các thao tác quản trị được gom theo endpoint, còn quyền thực thi được xác minh
// lại ở backend chứ không dựa vào việc ẩn/hiện nút trên giao diện.
export function getManagedUsers() {
    return request("/admin/users");
}

export function updateManagedUser(userId, changes) {
    return request("/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, changes }),
    });
}

export function deleteManagedUser(userId) {
    return request(`/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
    });
}

export function deleteManagedUsers(userIds) {
    return request("/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
    });
}

export function updateManagedUsers(userIds, changes) {
    return request("/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, changes }),
    });
}

export function manageManagedUserAiLimit(userId, aiLimitAction, amount) {
    return request("/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, aiLimitAction, amount }),
    });
}

export function getManagedUserAiUsage(userId) {
    return request(
        `/admin/users?aiUsageFor=${encodeURIComponent(userId)}`,
    );
}

export function resetManagedUserLoginAttempts(userId) {
    return request("/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, resetLoginAttempts: true }),
    });
}

export function getAccountDeletionRequests() {
    return request("/admin/deletion-requests");
}

export function requestAccountDeletion(userId) {
    return requestAccountDeletions([userId]).then((result) => ({
        request: result.requests[0],
    }));
}

export function requestAccountDeletions(userIds) {
    return request("/admin/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
    });
}

export function resolveAccountDeletionRequest(requestId, decision) {
    return request("/admin/deletion-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
    });
}

export function getAssignments() {
    return request("/assignments");
}

export function createAssignment(
    title,
    description,
    assignmentType,
    pointsMode,
    commonPoints,
    quizQuestions,
) {
    return request("/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title,
            description,
            assignmentType,
            pointsMode,
            commonPoints,
            quizQuestions,
        }),
    });
}

export function deleteAssignment(assignmentId) {
    return request(
        `/assignments?assignmentId=${encodeURIComponent(assignmentId)}`,
        { method: "DELETE" },
    );
}

export function getAssignmentSubmissions(assignmentId) {
    return request(
        `/assignments/${encodeURIComponent(assignmentId)}/submissions`,
    );
}

export function submitAssignmentAnswer(assignmentId, answer, answers) {
    return request(
        `/assignments/${encodeURIComponent(assignmentId)}/submissions`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answer, answers }),
        },
    );
}

export function reviewAssignmentSubmission(
    assignmentId,
    submissionId,
    feedback,
    teacherScore,
) {
    const body = { submissionId };
    if (feedback !== undefined) body.feedback = feedback;
    if (teacherScore !== undefined) body.teacherScore = teacherScore;
    return request(
        `/assignments/${encodeURIComponent(assignmentId)}/submissions`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

// Gửi câu hỏi đến API serverless hoặc Express; khóa AI không nằm trong frontend.
export async function chatWithAI(message, image = null, checkWork = false) {
    return request("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, image, checkWork }),
    });
}

export function getAiUsage() {
    return request("/ai/chat");
}
