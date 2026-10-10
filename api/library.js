import {
    ensureSameOrigin,
    getDatabase,
    requireRole,
    requireUser,
    sendApiError,
} from "../src/services/accountAuth.js";
import {
    getLibrarySchemaError,
    isMissingLibraryTableError,
    validateLibraryLesson,
} from "../src/services/libraryContent.js";

const STAFF_ROLES = ["teacher", "admin", "super_admin"];

// Chỉ nhân viên được thêm nội dung; body được chuẩn hóa bởi service trước khi
// ghi Supabase để API local và serverless áp dụng cùng luật dữ liệu.
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            return res
                .status(405)
                .json({ error: "Phương thức không được hỗ trợ." });
        }
        ensureSameOrigin(req);
        const db = getDatabase();
        const user = await requireUser(db, req);
        requireRole(user, STAFF_ROLES);

        const lesson = validateLibraryLesson(req.body);
        const { data, error } = await db
            .from("math_library_lessons")
            .insert({
                icon: lesson.icon,
                tag: lesson.tag,
                title: lesson.title,
                description: lesson.desc,
                search_key: lesson.key,
                introduction: lesson.introduction,
                sections: lesson.sections,
                sources: lesson.sources,
                timeline_year: lesson.timelineYear,
                created_by: user.id,
            })
            .select(
                "id, icon, tag, title, description, search_key, introduction, sections, sources, timeline_year",
            )
            .single();
        if (error) {
            // Biến lỗi thiếu bảng thành thông báo cấu hình có hướng khắc phục;
            // không che các lỗi truy vấn hoặc quyền DB khác.
            if (isMissingLibraryTableError(error)) {
                throw getLibrarySchemaError();
            }
            throw error;
        }

        const createdLesson = {
            id: data.id,
            icon: data.icon,
            tag: data.tag,
            title: data.title,
            desc: data.description,
            key: data.search_key,
            introduction: data.introduction,
            sections: data.sections,
            sources: data.sources,
        };
        return res.status(201).json({
            lesson: createdLesson,
            timelineEntry: [
                data.timeline_year,
                data.title,
                data.description,
            ],
        });
    } catch (error) {
        return sendApiError(res, error, "Lỗi thêm học liệu:");
    }
}
