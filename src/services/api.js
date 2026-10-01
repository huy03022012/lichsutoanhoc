const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(data.error || "Không thể kết nối máy chủ.");
    return data;
}

export function getContent() {
    return request("/content");
}

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

export async function chatWithAI(message) {
    return request("/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
}
