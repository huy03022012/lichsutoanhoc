// Giới hạn ảnh 3 MiB để request JSON còn nằm trong giới hạn của Vercel Functions.
export const AI_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const AI_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MAX_BASE64_LENGTH = Math.ceil(AI_IMAGE_MAX_BYTES / 3) * 4;
const BASE64_PATTERN =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// Kiểm tra cả định dạng lẫn kích thước trước khi gửi dữ liệu ảnh sang Gemini.
export function validateAiImage(image) {
    if (image == null) return null;
    if (
        typeof image !== "object" ||
        !AI_IMAGE_ALLOWED_TYPES.includes(image.mimeType) ||
        typeof image.data !== "string" ||
        image.data.length === 0 ||
        image.data.length > MAX_BASE64_LENGTH ||
        !BASE64_PATTERN.test(image.data)
    ) {
        return "Ảnh không hợp lệ. Chỉ nhận JPEG, PNG hoặc WebP tối đa 3 MB.";
    }

    const padding = image.data.endsWith("==")
        ? 2
        : image.data.endsWith("=")
          ? 1
          : 0;
    const imageSize = (image.data.length / 4) * 3 - padding;
    if (imageSize > AI_IMAGE_MAX_BYTES) {
        return "Ảnh vượt quá giới hạn 3 MB.";
    }
    return null;
}
