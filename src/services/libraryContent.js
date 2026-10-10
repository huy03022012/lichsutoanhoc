import { HttpError } from "./accountAuth.js";

const LIBRARY_SCHEMA_ERROR =
    "Chưa tạo bảng học liệu bổ sung trong Supabase. Hãy chạy lại supabase/schema.sql trong SQL Editor rồi khởi động lại server.";

// Chỉ nhận diện đúng lỗi bảng học liệu chưa được tạo; lỗi truy vấn khác không bị
// che thành dữ liệu rỗng vì đó có thể là lỗi vận hành cần xử lý.
export function isMissingLibraryTableError(error) {
    return (
        ["42P01", "PGRST205"].includes(error?.code) &&
        String(error?.message ?? "").includes("math_library_lessons")
    );
}

export function getLibrarySchemaError() {
    return new HttpError(503, LIBRARY_SCHEMA_ERROR);
}

// Xác thực và chuẩn hóa payload trước khi lưu: giới hạn kích thước trường,
// kiểm tra URL nguồn chỉ dùng HTTP(S), rồi dựng cùng cấu trúc mà client đọc.
export function validateLibraryLesson(body) {
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const tag = typeof body?.tag === "string" ? body.tag.trim() : "";
    const icon = typeof body?.icon === "string" ? body.icon.trim() : "";
    const desc = typeof body?.desc === "string" ? body.desc.trim() : "";
    const timelineYear =
        typeof body?.timelineYear === "string" ? body.timelineYear.trim() : "";
    const introduction =
        typeof body?.introduction === "string" ? body.introduction.trim() : "";
    const lessonText =
        typeof body?.lessonText === "string" ? body.lessonText.trim() : "";

    if (!title || title.length > 120) {
        throw new HttpError(400, "Tiêu đề cần từ 1 đến 120 ký tự.");
    }
    if (!tag || tag.length > 40) {
        throw new HttpError(400, "Chủ đề cần từ 1 đến 40 ký tự.");
    }
    if (!icon || [...icon].length > 8) {
        throw new HttpError(400, "Biểu tượng không hợp lệ.");
    }
    if (!desc || desc.length > 500) {
        throw new HttpError(400, "Giới thiệu ngắn cần từ 1 đến 500 ký tự.");
    }
    if (!timelineYear || timelineYear.length > 40) {
        throw new HttpError(400, "Mốc thời gian cần từ 1 đến 40 ký tự.");
    }
    if (!introduction || introduction.length > 3000) {
        throw new HttpError(400, "Mở đầu bài học cần từ 1 đến 3.000 ký tự.");
    }
    if (!lessonText || lessonText.length > 12000) {
        throw new HttpError(400, "Nội dung bài cần từ 1 đến 12.000 ký tự.");
    }
    if (!Array.isArray(body?.sources) || body.sources.length > 10) {
        throw new HttpError(400, "Danh sách nguồn tham khảo không hợp lệ.");
    }

    const sources = body.sources.map((source) => {
        const sourceTitle =
            typeof source?.title === "string" ? source.title.trim() : "";
        const sourceUrl =
            typeof source?.url === "string" ? source.url.trim() : "";
        let parsedUrl;
        try {
            parsedUrl = new URL(sourceUrl);
        } catch {
            throw new HttpError(400, "Mỗi nguồn cần có đường dẫn URL hợp lệ.");
        }
        if (
            !sourceTitle ||
            sourceTitle.length > 160 ||
            !["http:", "https:"].includes(parsedUrl.protocol)
        ) {
            throw new HttpError(400, "Tiêu đề hoặc đường dẫn nguồn tham khảo không hợp lệ.");
        }
        return { title: sourceTitle, url: parsedUrl.href };
    });

    // sections và key là dạng lưu trữ nội bộ dùng chung với học liệu dựng sẵn;
    // client chỉ gửi lessonText và không được quyết định cấu trúc JSON tùy ý.
    return {
        title,
        tag,
        icon,
        desc,
        timelineYear,
        introduction,
        sections: [{ heading: "Nội dung bài học", text: lessonText }],
        sources,
        key: `${title} ${tag} ${desc}`.toLocaleLowerCase("vi"),
    };
}

export async function loadAdditionalLibraryContent(db) {
    const { data, error } = await db
        .from("math_library_lessons")
        .select(
            "id, icon, tag, title, description, search_key, introduction, sections, sources, timeline_year, created_at",
        )
        .order("created_at", { ascending: true });
    if (error) {
        if (!isMissingLibraryTableError(error)) throw error;
        // Cho ứng dụng tiếp tục chạy với nội dung tĩnh trong lúc schema chưa cài,
        // đồng thời gửi cảnh báo rõ ràng để vận hành biết dữ liệu động đang thiếu.
        console.error("Library content schema is not installed:", error.message);
        return {
            lessons: [],
            timeline: [],
            schemaReady: false,
            schemaWarning: LIBRARY_SCHEMA_ERROR,
        };
    }

    return {
        lessons: data.map((lesson) => ({
            id: lesson.id,
            icon: lesson.icon,
            tag: lesson.tag,
            title: lesson.title,
            desc: lesson.description,
            key: lesson.search_key,
            introduction: lesson.introduction,
            sections: lesson.sections,
            sources: lesson.sources,
        })),
        timeline: data.map((lesson) => [
            lesson.timeline_year,
            lesson.title,
            lesson.description,
        ]),
        schemaReady: true,
        schemaWarning: "",
    };
}
