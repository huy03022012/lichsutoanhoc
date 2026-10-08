export const DEFAULT_AI_USAGE_LIMIT = 20;
export const AI_USAGE_WINDOW_SECONDS = 10 * 60;

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

export async function getAiUsage(db, userId) {
    const { data, error } = await db.rpc("get_account_ai_usage", {
        p_user_id: userId,
    });
    if (error) throw error;
    return normalizeUsage(data);
}

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

export async function manageAiUsage(db, userId, action, amount = null) {
    const { data, error } = await db.rpc("manage_account_ai_usage", {
        p_user_id: userId,
        p_action: action,
        p_amount: amount,
    });
    if (error) throw error;
    return normalizeUsage(data);
}
