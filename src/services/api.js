// Trong production gọi cùng domain (/api); khi cần có thể trỏ sang backend khác.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// Dùng chung cho mọi API để đọc lỗi từ backend và chuyển thành lỗi dễ hiển thị.
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

// Gửi câu hỏi đến API serverless hoặc Express; khóa AI không nằm trong frontend.
export async function chatWithAI(message) {
    return request("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
}
