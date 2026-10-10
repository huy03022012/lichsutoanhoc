export const DEFAULT_AI_USAGE_LIMIT = 20;
export const AI_USAGE_WINDOW_SECONDS = 10 * 60;

// RPC trả về tên cột snake_case từ database; chuyển về camelCase ở ranh giới service
// để frontend/backend dùng cùng một cấu trúc.
function normalizeUsage(data) {
    return {
        limit: Number(data.limit),
        used: Number(data.used),
        bonus: Number(data.bonus),
        remaining: Number(data.remaining),
        unlimited: data.unlimited === true,
        privileged: data.privileged === true,
        resetAt: data.reset_at,
    };
}

// Truy vấn chỉ đọc trạng thái hiện tại; không đặt chỗ một lượt AI.
export async function getAiUsage(db, userId) {
    const { data, error } = await db.rpc("get_account_ai_usage", {
        p_user_id: userId,
    });
    if (error) throw error;
    return normalizeUsage(data);
}

// Việc kiểm tra và tăng lượt được thực hiện trong một RPC phía database để các request
// đồng thời không thể cùng vượt qua hạn mức dựa trên một giá trị cũ.
export async function consumeAiUsage(db, userId) {
    const { data, error } = await db.rpc("consume_account_ai_usage", {
        p_user_id: userId,
    });
    if (error) throw error;
    return {
        ...normalizeUsage(data),
        allowed: data.allowed === true,
    };
}

// Các thay đổi do quản trị viên thực hiện cũng đi qua RPC để dùng chung quy tắc
// nghiệp vụ và tính nguyên tử với bộ đếm sử dụng.
export async function manageAiUsage(db, userId, action, amount = null) {
    const { data, error } = await db.rpc("manage_account_ai_usage", {
        p_user_id: userId,
        p_action: action,
        p_amount: amount,
    });
    if (error) throw error;
    return normalizeUsage(data);
}
