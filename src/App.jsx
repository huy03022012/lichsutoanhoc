import React, { useEffect, useMemo, useRef, useState } from "react";
import ChatMessage from "./components/chat/ChatMessage.jsx";
import {
    AI_IMAGE_ALLOWED_TYPES,
    AI_IMAGE_MAX_BYTES,
} from "./services/aiImage.js";
import {
    chatWithAI,
    createLibraryLesson,
    getAccount,
    getAiUsage,
    getContent,
    submitAccountAction,
} from "./services/api.js";
import AccountDialog from "./components/auth/AccountDialog.jsx";
import EmailVerificationDialog from "./components/auth/EmailVerificationDialog.jsx";
import PasswordChangeDialog from "./components/auth/PasswordChangeDialog.jsx";
import UserManagementView from "./components/admin/UserManagementView.jsx";
import AssignmentsView from "./components/assignments/AssignmentsView.jsx";

// Danh sách tab được dùng để vẽ thanh điều hướng và chọn màn hình tương ứng.
const navItems = [
    ["home", "Trang chủ"],
    ["library", "Thư viện"],
    ["timeline", "Dòng thời gian"],
    ["ai", "AI trợ giảng"],
    ["assignments", "Bài tập"],
];
// localStorage giữ 10 cuộc chat trên trình duyệt kể cả sau khi đóng website.
const AI_CHAT_STORAGE_KEY = "mathhistory-ai-conversations-v1";
// Đọc khóa cũ một lần để không làm mất lịch sử đã lưu trước khi hỗ trợ nhiều cuộc chat.
const LEGACY_AI_CHAT_STORAGE_KEY = "mathhistory-ai-chat-v1";
const AI_GREETING_TEXT =
    "Xin chào! Bạn có thể hỏi về Lịch sử Toán học hoặc gửi bài tập. Mặc định mình chỉ gợi ý; nếu đã làm xong, bật “Chấm bài đã làm” để mình góp ý và đưa lời giải tham khảo.";
const AI_GREETING_REMAINDER =
    "! Bạn có thể hỏi về Lịch sử Toán học hoặc gửi bài tập. Mặc định mình chỉ gợi ý; nếu đã làm xong, bật “Chấm bài đã làm” để mình góp ý và đưa lời giải tham khảo.";
const ACCOUNT_ROLE_LABELS = {
    student: "Học sinh",
    teacher: "Giáo viên",
    admin: "Admin",
    super_admin: "Super admin",
};

function AccountMenu({ user, onEmail, onPassword, onSignOut, mobile = false }) {
    return (
        <details
            className={`accountDropdown${mobile ? " mobile" : ""}`}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    event.currentTarget.open = false;
                }
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector("summary")?.focus();
                }
            }}
        >
            <summary className="accountDropdownTrigger">
                <span className="accountIdentity">
                    {user.displayName || user.username} ·{" "}
                    {ACCOUNT_ROLE_LABELS[user.role]}
                </span>
                <span className="accountDropdownChevron" aria-hidden="true">
                    ▾
                </span>
            </summary>
            <div className="accountDropdownPanel">
                <button
                    type="button"
                    onClick={(event) => {
                        event.currentTarget.closest("details").open = false;
                        onEmail();
                    }}
                >
                    {user.emailVerified ? "Cập nhật email" : "Xác thực email"}
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.currentTarget.closest("details").open = false;
                        onPassword();
                    }}
                >
                    Đổi mật khẩu
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.currentTarget.closest("details").open = false;
                        onSignOut();
                    }}
                >
                    Đăng xuất
                </button>
            </div>
        </details>
    );
}

function getAiGreeting(displayName = "") {
    const safeName = displayName
        .normalize("NFC")
        .replace(/[^\p{L}\p{M}\p{N} '-]/gu, "")
        .trim()
        .slice(0, 60);
    return `Xin chào${safeName ? `, ${safeName}` : ""}${AI_GREETING_REMAINDER}`;
}

const initialAiMessages = [
    {
        role: "bot",
        text: AI_GREETING_TEXT,
    },
];

// Tạo một cuộc hội thoại mới với lời chào ban đầu từ AI.
function createConversation(messages = initialAiMessages) {
    return {
        id: `${Date.now()}-${Math.random()}`,
        title: "Cuộc trò chuyện mới",
        updatedAt: Date.now(),
        messages,
    };
}

// Đặt tên cuộc chat theo câu hỏi đầu tiên để người dùng dễ tìm lại.
function getConversationTitle(messages) {
    const firstQuestion = messages.find((message) => message.role === "me");
    if (!firstQuestion) return "Cuộc trò chuyện mới";
    const title = firstQuestion.text.replace(/\s+/g, " ").trim();
    return title.length > 42 ? `${title.slice(0, 42)}…` : title;
}

// Chỉ nhận dữ liệu có role và nội dung hợp lệ trước khi hiển thị Markdown.
function isValidMessages(messages) {
    return (
        Array.isArray(messages) &&
        messages.every(
            (message) =>
                (message.role === "bot" || message.role === "me") &&
                typeof message.text === "string",
        )
    );
}

// Khôi phục lịch sử đã lưu; nếu dữ liệu hỏng thì chuyển về cuộc chat trống.
function readSavedAiConversations() {
    try {
        // Ưu tiên bộ nhớ bền vững; đọc sessionStorage để chuyển lịch sử cũ sang localStorage.
        const saved =
            localStorage.getItem(AI_CHAT_STORAGE_KEY) ??
            sessionStorage.getItem(AI_CHAT_STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);
            if (
                Array.isArray(state.conversations) &&
                state.conversations.every(
                    (conversation) =>
                        typeof conversation.id === "string" &&
                        typeof conversation.title === "string" &&
                        Number.isFinite(conversation.updatedAt) &&
                        isValidMessages(conversation.messages),
                )
            ) {
                const conversations = state.conversations
                    .slice(0, 10)
                    .sort((a, b) => b.updatedAt - a.updatedAt);
                const activeId = conversations.some(
                    (conversation) => conversation.id === state.activeId,
                )
                    ? state.activeId
                    : conversations[0]?.id;
                if (conversations.length) return { conversations, activeId };
            }
        }

        const legacyMessages =
            localStorage.getItem(LEGACY_AI_CHAT_STORAGE_KEY) ??
            sessionStorage.getItem(LEGACY_AI_CHAT_STORAGE_KEY);
        if (legacyMessages) {
            const messages = JSON.parse(legacyMessages);
            if (isValidMessages(messages)) {
                const conversation = createConversation(messages);
                conversation.title = getConversationTitle(messages);
                return {
                    conversations: [conversation],
                    activeId: conversation.id,
                };
            }
        }
    } catch {
        // Nếu dữ liệu phiên cũ không đọc được, bắt đầu cuộc trò chuyện mới.
    }
    const conversation = createConversation();
    return { conversations: [conversation], activeId: conversation.id };
}

// Thẻ học liệu được dùng lại ở trang chủ và trong thư viện.
function Card({ lesson, onReadMore }) {
    return (
        <article className="card">
            <div className="icon">{lesson.icon}</div>
            <span className="tag">{lesson.tag}</span>
            <h3>{lesson.title}</h3>
            <p>{lesson.desc}</p>
            <button
                className="secondary cardReadMore"
                onClick={() => onReadMore(lesson)}
            >
                Đọc thêm →
            </button>
        </article>
    );
}

// Trang chủ nhận dữ liệu từ API và đưa người dùng đến các khu vực chính.
function Home({ setView, lessons, timeline, onReadMore }) {
    return (
        <section className="view active">
            <div className="hero">
                <div className="heroText">
                    <div className="eyebrow">Học tập • Khám phá • AI</div>
                    <h1>
                        Lịch sử Toán học
                        <br />
                        <em>trở nên sống động.</em>
                    </h1>
                    <p>
                        Khám phá những câu chuyện phía sau các con số, công thức
                        và phát minh. Học sinh có thể xem học liệu, nghiên cứu
                        nhân vật, hỏi AI và kiểm tra kiến thức sau mỗi bài.
                    </p>
                    <div className="actions">
                        <button
                            className="primary"
                            onClick={() => setView("library")}
                        >
                            Bắt đầu khám phá →
                        </button>
                        <button
                            className="secondary"
                            onClick={() => setView("ai")}
                        >
                            Hỏi AI
                        </button>
                    </div>
                </div>
                <div className="heroCard">
                    <div>
                        <span className="tag">Bài học nổi bật</span>
                        <h2>Toán học qua các nền văn minh</h2>
                        <p className="muted">
                            Từ Ai Cập, Hy Lạp đến những đóng góp làm thay đổi
                            Toán học hiện đại.
                        </p>
                    </div>
                    <div className="orb" />
                    <div className="mini">
                        <Stat value={timeline.length} label="mốc thời gian" />
                        <Stat value={lessons.length} label="bài học" />
                        <Stat value="AI" label="trợ giảng" />
                    </div>
                </div>
            </div>
            <div className="section">
                <div className="sectionHead">
                    <div>
                        <h2>Học liệu nổi bật</h2>
                        <div className="muted">
                            Nội dung được tổ chức để học sinh dễ tìm và dễ học.
                        </div>
                    </div>
                </div>
                <div className="grid">
                    {lessons.slice(0, 3).map((l) => (
                        <Card
                            key={l.id}
                            lesson={l}
                            onReadMore={onReadMore}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

// Hiển thị một con số tổng hợp ở thẻ giới thiệu trang chủ.
function Stat({ value, label }) {
    return (
        <div className="stat">
            <b>{value}</b>
            <small>{label}</small>
        </div>
    );
}
// Thư viện lọc danh sách đã tải về; tìm kiếm không tạo yêu cầu API mới.
function Library({
    lessons,
    onReadMore,
    user,
    onLessonCreated,
    librarySchemaReady,
    librarySchemaWarning,
}) {
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [createError, setCreateError] = useState("");
    const [createNotice, setCreateNotice] = useState("");
    const [lessonDraft, setLessonDraft] = useState({
        title: "",
        icon: "📚",
        tag: "",
        desc: "",
        timelineYear: "",
        introduction: "",
        lessonText: "",
        sourcesText: "",
    });
    const canCreateLesson = ["teacher", "admin", "super_admin"].includes(
        user?.role,
    );
    const filtered = useMemo(
        () =>
            lessons.filter((x) =>
                `${x.title} ${x.desc} ${x.key}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, lessons],
    );

    async function submitNewLesson(event) {
        event.preventDefault();
        setSaving(true);
        setCreateError("");
        setCreateNotice("");
        try {
            const sources = lessonDraft.sourcesText
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    const separator = line.indexOf("|");
                    if (separator < 1) {
                        throw new Error(
                            "Mỗi nguồn cần nhập theo dạng: Tên nguồn | https://đường-dẫn",
                        );
                    }
                    return {
                        title: line.slice(0, separator).trim(),
                        url: line.slice(separator + 1).trim(),
                    };
                });
            const { lesson, timelineEntry } = await createLibraryLesson({
                ...lessonDraft,
                sources,
            });
            onLessonCreated(lesson, timelineEntry);
            setLessonDraft({
                title: "",
                icon: "📚",
                tag: "",
                desc: "",
                timelineYear: "",
                introduction: "",
                lessonText: "",
                sourcesText: "",
            });
            setCreating(false);
            setCreateNotice("Đã thêm bài vào thư viện và dòng thời gian.");
        } catch (requestError) {
            setCreateError(requestError.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="view active">
            <Header
                title="Thư viện lịch sử Toán học"
                text="Tìm kiếm bài học, nhà toán học và chủ đề."
            />
            {librarySchemaWarning && (
                <p className="authNotice" role="status">
                    {librarySchemaWarning}
                </p>
            )}
            {canCreateLesson && librarySchemaReady && (
                <section className="libraryContribution card">
                    <div className="libraryContributionHeader">
                        <div>
                            <h3>Đóng góp học liệu</h3>
                            <p className="muted">
                                Tạo bài mới cho thư viện; mốc thời gian được thêm
                                tự động từ năm, tiêu đề và giới thiệu.
                            </p>
                        </div>
                        <button
                            className="primary"
                            type="button"
                            onClick={() => {
                                setCreating((open) => !open);
                                setCreateError("");
                            }}
                        >
                            {creating ? "Đóng biểu mẫu" : "Thêm học liệu"}
                        </button>
                    </div>
                    {createNotice && (
                        <p className="assignmentScore" role="status">
                            {createNotice}
                        </p>
                    )}
                    {creating && (
                        <form
                            className="libraryLessonForm"
                            onSubmit={submitNewLesson}
                        >
                            <div className="libraryFormGrid">
                                <label>
                                    Tiêu đề bài học
                                    <input
                                        maxLength={120}
                                        required
                                        value={lessonDraft.title}
                                        onChange={(event) =>
                                            setLessonDraft((draft) => ({
                                                ...draft,
                                                title: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <label>
                                    Chủ đề
                                    <input
                                        maxLength={40}
                                        required
                                        placeholder="Ví dụ: Đại số"
                                        value={lessonDraft.tag}
                                        onChange={(event) =>
                                            setLessonDraft((draft) => ({
                                                ...draft,
                                                tag: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <label>
                                    Biểu tượng
                                    <input
                                        maxLength={8}
                                        required
                                        value={lessonDraft.icon}
                                        onChange={(event) =>
                                            setLessonDraft((draft) => ({
                                                ...draft,
                                                icon: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <label>
                                    Năm hoặc mốc lịch sử
                                    <input
                                        maxLength={40}
                                        required
                                        placeholder="Ví dụ: Thế kỷ IX"
                                        value={lessonDraft.timelineYear}
                                        onChange={(event) =>
                                            setLessonDraft((draft) => ({
                                                ...draft,
                                                timelineYear: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                            </div>
                            <label>
                                Giới thiệu ngắn
                                <textarea
                                    maxLength={500}
                                    required
                                    value={lessonDraft.desc}
                                    onChange={(event) =>
                                        setLessonDraft((draft) => ({
                                            ...draft,
                                            desc: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label>
                                Mở đầu bài học
                                <textarea
                                    maxLength={3000}
                                    required
                                    value={lessonDraft.introduction}
                                    onChange={(event) =>
                                        setLessonDraft((draft) => ({
                                            ...draft,
                                            introduction: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label>
                                Nội dung chi tiết
                                <textarea
                                    className="libraryLessonBody"
                                    maxLength={12000}
                                    required
                                    value={lessonDraft.lessonText}
                                    onChange={(event) =>
                                        setLessonDraft((draft) => ({
                                            ...draft,
                                            lessonText: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label>
                                Nguồn tham khảo (không bắt buộc, mỗi dòng một
                                nguồn: Tên nguồn | URL)
                                <textarea
                                    maxLength={3000}
                                    placeholder={"Wikipedia tiếng Việt | https://vi.wikipedia.org/\nMacTutor | https://mathshistory.st-andrews.ac.uk/"}
                                    value={lessonDraft.sourcesText}
                                    onChange={(event) =>
                                        setLessonDraft((draft) => ({
                                            ...draft,
                                            sourcesText: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                            {createError && (
                                <p className="error" role="alert">
                                    {createError}
                                </p>
                            )}
                            <button className="primary" disabled={saving}>
                                {saving ? "Đang lưu…" : "Đăng học liệu"}
                            </button>
                        </form>
                    )}
                </section>
            )}
            <form
                className="search"
                onSubmit={(event) => {
                    event.preventDefault();
                    setQuery(q.trim());
                }}
            >
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="🔎 Tìm kiếm: Euclid, Ai Cập, số học..."
                />
                <button className="primary" type="submit">
                    Tìm
                </button>
            </form>
            {filtered.length ? (
                <div className="grid">
                    {filtered.map((lesson) => (
                        <Card
                            key={lesson.id}
                            lesson={lesson}
                            onReadMore={onReadMore}
                        />
                    ))}
                </div>
            ) : (
                <Empty text="Không tìm thấy học liệu phù hợp." />
            )}
        </section>
    );
}
// Trang chi tiết hiển thị nội dung bài và các liên kết nguồn tham khảo.
function LessonDetail({ lesson, onBack }) {
    return (
        <section className="view active lessonDetail">
            <button className="secondary backButton" onClick={onBack}>
                ← Quay lại thư viện
            </button>
            <article className="detailArticle">
                <div className="icon detailIcon" aria-hidden="true">
                    {lesson.icon}
                </div>
                <span className="tag">{lesson.tag}</span>
                <h1>{lesson.title}</h1>
                <p className="detailIntroduction">{lesson.introduction}</p>
                {lesson.sections.map((section) => (
                    <section className="detailSection" key={section.heading}>
                        <h2>{section.heading}</h2>
                        <p>{section.text}</p>
                    </section>
                ))}
                {lesson.sources?.length > 0 && (
                    <section
                        className="sourcesSection"
                        aria-labelledby="sources-title"
                    >
                        <h2 id="sources-title">Nguồn tham khảo</h2>
                        <ul className="sourceList">
                            {lesson.sources.map((source) => (
                                <li key={source.url}>
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {source.title}
                                        <span aria-hidden="true"> ↗</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                        <p className="muted sourceNote">
                            Mở nguồn trong tab mới để đọc thêm và đối chiếu
                            thông tin.
                        </p>
                    </section>
                )}
            </article>
        </section>
    );
}
// Tiêu đề dùng chung cho các trang con.
function Header({ title, text }) {
    return (
        <div className="sectionHead">
            <div>
                <h2>{title}</h2>
                <div className="muted">{text}</div>
            </div>
        </div>
    );
}
// Trạng thái rỗng dùng khi tìm kiếm không có kết quả.
function Empty({ text }) {
    return <div className="card empty">{text}</div>;
}
// Trình bày các mốc theo đúng thứ tự backend cung cấp.
function TimelineView({ timeline }) {
    return (
        <section className="view active">
            <Header
                title="Dòng thời gian"
                text="Một cách trực quan để khám phá sự phát triển của Toán học."
            />
            <div className="timeline">
                {timeline.map(([year, name, desc]) => (
                    <div className="time" key={name}>
                        <strong>{year}</strong>
                        <h3>{name}</h3>
                        <p className="muted">{desc}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
// Khu vực chat: quản lý 10 cuộc gần đây, trạng thái gửi và lưu trên trình duyệt.
function AIView({ displayName }) {
    // State chat gồm danh sách cuộc, ID đang mở, nội dung nhập, trạng thái gửi và giao diện phóng to.
    const [chatState, setChatState] = useState(readSavedAiConversations);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCheckWorkMode, setIsCheckWorkMode] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState("environment");
    const [isCameraLoading, setIsCameraLoading] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [aiUsage, setAiUsage] = useState(null);
    const [aiUsageError, setAiUsageError] = useState("");
    const imageInputRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const cameraVideoRef = useRef(null);
    const cameraStreamRef = useRef(null);
    const activeConversation =
        chatState.conversations.find(
            (conversation) => conversation.id === chatState.activeId,
        ) ?? chatState.conversations[0];
    const messages = activeConversation.messages;

    async function refreshAiUsage() {
        try {
            const result = await getAiUsage();
            setAiUsage(result.usage);
            setAiUsageError("");
        } catch (usageError) {
            setAiUsageError(usageError.message);
        }
    }

    useEffect(() => {
        refreshAiUsage();
        const interval = window.setInterval(refreshAiUsage, 15000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        const personalizedGreeting = getAiGreeting(displayName);
        if (personalizedGreeting === AI_GREETING_TEXT) return;

        setChatState((current) => {
            let changed = false;
            const conversations = current.conversations.map((conversation) => {
                const [firstMessage, ...remainingMessages] =
                    conversation.messages;
                if (
                    firstMessage?.role !== "bot" ||
                    !firstMessage.text.startsWith("Xin chào") ||
                    !firstMessage.text.includes(AI_GREETING_REMAINDER)
                ) {
                    return conversation;
                }
                changed = true;
                return {
                    ...conversation,
                    messages: [
                        { ...firstMessage, text: personalizedGreeting },
                        ...remainingMessages,
                    ],
                };
            });
            return changed ? { ...current, conversations } : current;
        });
    }, [displayName]);

    // Giữ khung chat ở cuối khi có tin nhắn mới, trạng thái chờ hoặc đổi cuộc trò chuyện.
    useEffect(() => {
        const messagesContainer = messagesContainerRef.current;
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, [activeConversation.id, messages, loading]);

    // Chỉ bật camera khi hộp chụp ảnh đang mở; đổi camera sẽ dừng stream cũ trước.
    useEffect(() => {
        if (!isCameraOpen) return undefined;

        let cancelled = false;
        let activeStream;
        setIsCameraLoading(true);
        setCameraError("");

        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError(
                    "Trình duyệt không hỗ trợ camera hoặc trang chưa dùng HTTPS.",
                );
                setIsCameraLoading(false);
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: { ideal: cameraFacingMode },
                        width: { ideal: 1600 },
                        height: { ideal: 1200 },
                    },
                });
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                activeStream = stream;
                cameraStreamRef.current = stream;
                if (cameraVideoRef.current) {
                    cameraVideoRef.current.srcObject = stream;
                    await cameraVideoRef.current.play();
                }
            } catch (cameraStartError) {
                if (!cancelled) {
                    console.error("Không thể mở camera:", cameraStartError);
                    setCameraError(
                        cameraStartError.name === "NotAllowedError"
                            ? "Bạn chưa cấp quyền dùng camera cho website."
                            : "Không thể mở camera. Hãy kiểm tra camera đang hoạt động và thử lại.",
                    );
                }
            } finally {
                if (!cancelled) setIsCameraLoading(false);
            }
        }

        startCamera();
        return () => {
            cancelled = true;
            activeStream?.getTracks().forEach((track) => track.stop());
            if (cameraStreamRef.current === activeStream) {
                cameraStreamRef.current = null;
            }
            if (cameraVideoRef.current) {
                cameraVideoRef.current.srcObject = null;
            }
        };
    }, [isCameraOpen, cameraFacingMode]);

    // Lưu bền vững trên trình duyệt; xóa khóa session cũ sau khi chuyển dữ liệu.
    useEffect(() => {
        try {
            localStorage.setItem(
                AI_CHAT_STORAGE_KEY,
                // Không lưu ảnh base64 vào localStorage; ảnh lớn, nên lưu tên và nội dung chat thôi.
                JSON.stringify(chatState, (key, value) =>
                    key === "imageData" ? undefined : value,
                ),
            );
            sessionStorage.removeItem(AI_CHAT_STORAGE_KEY);
            sessionStorage.removeItem(LEGACY_AI_CHAT_STORAGE_KEY);
            localStorage.removeItem(LEGACY_AI_CHAT_STORAGE_KEY);
        } catch (storageError) {
            console.error(
                "Không thể lưu lịch sử trò chuyện trên trình duyệt:",
                storageError,
            );
        }
    }, [chatState]);

    // Tạo cuộc trò chuyện mới và bỏ cuộc cũ nhất nếu đã vượt quá 10 cuộc.
    function startNewConversation() {
        setChatState((current) => {
            const active = current.conversations.find(
                (conversation) => conversation.id === current.activeId,
            );
            if (
                active &&
                !active.messages.some((message) => message.role === "me")
            ) {
                return {
                    ...current,
                    activeId: active.id,
                };
            }

            const conversation = createConversation([
                { role: "bot", text: getAiGreeting(displayName) },
            ]);
            return {
                conversations: [conversation, ...current.conversations].slice(
                    0,
                    10,
                ),
                activeId: conversation.id,
            };
        });
        setError("");
        setInput("");
        setSelectedImage(null);
        setIsCameraOpen(false);
    }

    // Xóa toàn bộ cuộc chat sau khi người dùng xác nhận.
    function clearConversationHistory() {
        if (loading || !window.confirm("Bạn muốn xóa toàn bộ lịch sử trò chuyện?")) {
            return;
        }
        const conversation = createConversation([
            { role: "bot", text: getAiGreeting(displayName) },
        ]);
        setChatState({
            conversations: [conversation],
            activeId: conversation.id,
        });
        setError("");
        setInput("");
        setSelectedImage(null);
        setIsCameraOpen(false);
    }

    // Xóa riêng một cuộc; nếu đó là cuộc đang mở thì chuyển sang cuộc còn lại.
    function deleteConversation(conversationId) {
        if (
            loading ||
            !window.confirm("Bạn muốn xóa riêng cuộc trò chuyện này?")
        ) {
            return;
        }

        setChatState((current) => {
            const conversations = current.conversations.filter(
                (conversation) => conversation.id !== conversationId,
            );
            const remaining =
                conversations.length > 0
                    ? conversations
                    : [
                          createConversation([
                              { role: "bot", text: getAiGreeting(displayName) },
                          ]),
                      ];
            const activeId =
                current.activeId === conversationId
                    ? remaining[0].id
                    : current.activeId;

            return { conversations: remaining, activeId };
        });
        setError("");
        setInput("");
        setSelectedImage(null);
        setIsCameraOpen(false);
    }

    // Cập nhật một cuộc theo ID để phản hồi API luôn gắn đúng hội thoại ban đầu.
    function updateConversation(conversationId, updateMessages) {
        setChatState((current) => {
            const conversations = current.conversations.map((conversation) => {
                if (conversation.id !== conversationId) return conversation;
                const nextMessages = updateMessages(conversation.messages);
                return {
                    ...conversation,
                    messages: nextMessages,
                    title: getConversationTitle(nextMessages),
                    updatedAt: Date.now(),
                };
            });
            return {
                ...current,
                conversations: conversations.sort(
                    (a, b) => b.updatedAt - a.updatedAt,
                ),
            };
        });
    }

    // Kiểm tra và đọc ảnh đã chọn hoặc vừa chụp theo cùng một luồng.
    async function useImageFile(file) {
        if (!AI_IMAGE_ALLOWED_TYPES.includes(file.type)) {
            throw new Error("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
        }
        if (file.size > AI_IMAGE_MAX_BYTES) {
            throw new Error("Ảnh cần có dung lượng tối đa 3 MB.");
        }

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
                typeof reader.result === "string"
                    ? resolve(reader.result)
                    : reject(new Error("Không thể đọc ảnh. Vui lòng thử lại."));
            reader.onerror = () =>
                reject(new Error("Không thể đọc ảnh. Vui lòng thử lại."));
            reader.readAsDataURL(file);
        });
        const base64 = dataUrl.split(",")[1];
        if (!base64) {
            throw new Error("Ảnh không đúng định dạng. Vui lòng chọn ảnh khác.");
        }

        setSelectedImage({
            name: file.name,
            mimeType: file.type,
            data: base64,
            preview: dataUrl,
        });
        setError("");
    }

    // Đọc lựa chọn trong máy; xóa value để lần sau chọn lại đúng file đó vẫn phát change.
    async function handleImageSelection(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            await useImageFile(file);
        } catch (imageError) {
            setError(imageError.message);
        }
    }

    // Chụp khung hình hiện tại thành JPEG rồi dùng cùng quy trình kiểm tra như ảnh tải lên.
    function captureCameraImage() {
        const video = cameraVideoRef.current;
        if (!video?.videoWidth || !video.videoHeight) {
            setCameraError("Camera chưa sẵn sàng. Vui lòng đợi rồi chụp lại.");
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        canvas.toBlob(
            async (blob) => {
                if (!blob) {
                    setCameraError("Không thể tạo ảnh. Vui lòng chụp lại.");
                    return;
                }
                const imageFile = new File(
                    [blob],
                    `anh-bai-tap-${Date.now()}.jpg`,
                    { type: "image/jpeg" },
                );
                try {
                    await useImageFile(imageFile);
                    setIsCameraOpen(false);
                } catch (imageError) {
                    setCameraError(imageError.message);
                }
            },
            "image/jpeg",
            0.88,
        );
    }

    // Gửi văn bản và/hoặc ảnh lên backend; lịch sử lưu tên ảnh, không lưu dữ liệu ảnh.
    async function ask() {
        const v = input.trim();
        if (
            (!v && !selectedImage) ||
            loading ||
            (aiUsage && !aiUsage.unlimited && aiUsage.remaining <= 0)
        ) {
            return;
        }
        setError("");
        const messageId = `${Date.now()}-${Math.random()}`;
        const conversationId = activeConversation.id;
        const messageText =
            v ||
            (isCheckWorkMode
                ? "Hãy chấm bài làm và đáp án của em trong ảnh. Nếu ảnh chỉ có đề bài, hãy yêu cầu em gửi phần đã làm."
                : "Hãy gợi ý phương pháp giải bài tập trong ảnh, không đưa đáp số.");
        const imageForRequest = selectedImage;
        // Gắn ID tạm cho câu hỏi để có thể gỡ riêng nếu request thất bại.
        updateConversation(conversationId, (current) => [
            ...current,
            {
                role: "me",
                text: messageText,
                id: messageId,
                ...(imageForRequest && {
                    imageName: imageForRequest.name,
                    imageData: imageForRequest.preview,
                }),
            },
        ]);
        setLoading(true);
        try {
            const data = await chatWithAI(
                v,
                imageForRequest
                    ? {
                          mimeType: imageForRequest.mimeType,
                          data: imageForRequest.data,
                      }
                    : null,
                isCheckWorkMode,
            );
            if (!data.answer)
                throw new Error("Dịch vụ AI không trả về nội dung.");
            if (data.usage) setAiUsage(data.usage);
            setInput("");
            setSelectedImage(null);
            updateConversation(conversationId, (current) => [
                ...current,
                {
                    role: "bot",
                    text: data.answer,
                },
            ]);
        } catch (err) {
            // Không giữ câu hỏi gửi lỗi trong lịch sử; thông báo lỗi hiển thị riêng bên dưới.
            updateConversation(conversationId, (current) =>
                current.filter((message) => message.id !== messageId),
            );
            setError(err.message || "Không thể nhận phản hồi từ AI.");
            refreshAiUsage();
        } finally {
            setLoading(false);
        }
    }
    // Chọn hội thoại đang hiển thị và bỏ ảnh đang soạn để tránh gửi nhầm sang chat khác.
    return (
        <section className="view active">
            <Header
                title="AI trợ giảng"
                text="Đặt câu hỏi để hiểu bài theo cách đơn giản hơn."
            />
            <div className={`ai aiWorkspace${isExpanded ? " aiWorkspaceExpanded" : ""}`}>
                <aside className="chatSidebar">
                    <button
                        className="primary newChatButton"
                        type="button"
                        onClick={startNewConversation}
                        disabled={loading}
                    >
                        + Cuộc trò chuyện mới
                    </button>
                    <div className="chatHistoryHeading">
                        <h3>10 cuộc trò chuyện gần đây</h3>
                        <button
                            className="clearHistoryButton"
                            type="button"
                            onClick={clearConversationHistory}
                            disabled={loading}
                        >
                            Xóa lịch sử
                        </button>
                    </div>
                    <div className="conversationList">
                        {chatState.conversations
                            .filter(
                                (conversation) =>
                                    conversation.id === activeConversation.id ||
                                    conversation.messages.some(
                                        (message) => message.role === "me",
                                    ),
                            )
                            .map((conversation) => (
                                <div
                                    className="conversationRow"
                                    key={conversation.id}
                                >
                                    <button
                                        className={`conversationItem${conversation.id === activeConversation.id ? " selected" : ""}`}
                                        type="button"
                                        onClick={() => {
                                            if (loading) return;
                                            setChatState((current) => ({
                                                ...current,
                                                activeId: conversation.id,
                                            }));
                                            setSelectedImage(null);
                                            setIsCameraOpen(false);
                                            setError("");
                                        }}
                                        disabled={loading}
                                        title={conversation.title}
                                    >
                                        <span className="conversationTitle">
                                            {conversation.title}
                                        </span>
                                        <small>
                                            {new Date(
                                                conversation.updatedAt,
                                            ).toLocaleDateString("vi-VN", {
                                                day: "2-digit",
                                                month: "2-digit",
                                            })}
                                        </small>
                                    </button>
                                    <button
                                        className="deleteConversationButton"
                                        type="button"
                                        onClick={() =>
                                            deleteConversation(conversation.id)
                                        }
                                        disabled={loading}
                                        aria-label={`Xóa cuộc trò chuyện: ${conversation.title}`}
                                        title="Xóa cuộc trò chuyện"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                    </div>
                    <div className="featureCard">
                        <span className="tag">Các chức năng</span>
                        <h3>AI học cùng bạn</h3>
                        <ul>
                            <li>Giải thích khái niệm</li>
                            <li>Tóm tắt bài học</li>
                            <li>Tạo câu hỏi luyện tập</li>
                            <li>Gợi ý nghiên cứu</li>
                            <li>Phân tích câu trả lời sai</li>
                            <li>Gợi ý bài học tiếp theo</li>
                        </ul>
                    </div>
                </aside>
                <div className={`chat${isExpanded ? " chatExpanded" : ""}`}>
                    <div className="chatHeader">
                        <div>
                            <span className="muted">Trò chuyện với AI</span>
                            <p className="aiUsageIndicator" role="status">
                                {aiUsage
                                    ? aiUsage.unlimited
                                        ? "Lượt AI: không giới hạn"
                                        : `Còn ${aiUsage.remaining} lượt AI · Làm mới lúc ${new Date(aiUsage.resetAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                                    : aiUsageError || "Đang tải hạn mức AI…"}
                            </p>
                        </div>
                        <button
                            className="secondary expandChat"
                            type="button"
                            onClick={() => setIsExpanded((expanded) => !expanded)}
                            aria-label={
                                isExpanded
                                    ? "Thu nhỏ khung trò chuyện"
                                    : "Phóng to khung trò chuyện"
                            }
                            title={
                                isExpanded
                                    ? "Thu nhỏ khung trò chuyện"
                                    : "Phóng to khung trò chuyện"
                            }
                        >
                            {isExpanded ? "Thu nhỏ ↙" : "Phóng to ↗"}
                        </button>
                    </div>
                    <div className="messages" ref={messagesContainerRef}>
                        {messages.map((message, index) => (
                            <ChatMessage
                                key={message.id ?? `${message.role}-${index}`}
                                message={message}
                            />
                        ))}
                        {loading && (
                            <ChatMessage
                                message={{
                                    role: "bot",
                                    text: "Đang suy nghĩ…",
                                }}
                            />
                        )}
                    </div>
                    {selectedImage && (
                        <div className="selectedImagePreview">
                            <img
                                src={selectedImage.preview}
                                alt={`Ảnh đính kèm: ${selectedImage.name}`}
                            />
                            <span title={selectedImage.name}>
                                {selectedImage.name}
                            </span>
                            <button
                                className="removeImageButton"
                                type="button"
                                onClick={() => setSelectedImage(null)}
                                disabled={loading}
                                aria-label="Bỏ ảnh đính kèm"
                            >
                                ×
                            </button>
                        </div>
                    )}
                    <div className="chatbar">
                        <button
                            className={`checkWorkToggle${isCheckWorkMode ? " active" : ""}`}
                            type="button"
                            aria-pressed={isCheckWorkMode}
                            onClick={() =>
                                setIsCheckWorkMode((isEnabled) => !isEnabled)
                            }
                            disabled={loading}
                        >
                            {isCheckWorkMode
                                ? "✓ Chấm bài đã làm: Bật"
                                : "Chấm bài đã làm: Tắt"}
                        </button>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && ask()}
                            disabled={loading}
                            placeholder="Nhập câu hỏi hoặc gửi ảnh bài tập..."
                        />
                        <input
                            ref={imageInputRef}
                            className="visuallyHidden"
                            type="file"
                            accept={AI_IMAGE_ALLOWED_TYPES.join(",")}
                            onChange={handleImageSelection}
                            disabled={loading}
                            aria-label="Chọn ảnh bài tập"
                        />
                        <button
                            className="secondary attachImageButton"
                            type="button"
                            onClick={() => {
                                setCameraError("");
                                setIsCameraOpen(true);
                            }}
                            disabled={loading}
                            aria-label="Chụp ảnh bài tập"
                            title="Mở camera để chụp ảnh bài tập"
                        >
                            📷 Chụp ảnh
                        </button>
                        <button
                            className="secondary attachImageButton"
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            disabled={loading}
                            aria-label="Chọn ảnh trong máy"
                            title="Chọn ảnh JPEG, PNG hoặc WebP (tối đa 3 MB)"
                        >
                            🖼️ Chọn ảnh
                        </button>
                        <button
                            className="primary"
                            onClick={ask}
                            disabled={
                                loading ||
                                (!input.trim() && !selectedImage) ||
                                (aiUsage &&
                                    !aiUsage.unlimited &&
                                    aiUsage.remaining <= 0)
                            }
                        >
                            {loading ? "Đang gửi…" : "Gửi"}
                        </button>
                    </div>
                    <p className="aiHintPolicy">
                        {isCheckWorkMode
                            ? "Chế độ chấm: AI sẽ nhận xét bài làm và đưa lời giải tham khảo để bạn đối chiếu."
                            : "Chế độ gợi ý: AI chỉ hướng dẫn phương pháp, không đưa đáp số."}{" "}
                        Nhận JPEG, PNG hoặc WebP tối đa 3 MB. Ảnh được chuyển
                        đến AI để phân tích; lịch sử chỉ lưu tên ảnh.
                    </p>
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                </div>
            </div>
            {isCameraOpen && (
                <div
                    className="cameraBackdrop"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            setIsCameraOpen(false);
                        }
                    }}
                >
                    <section
                        className="cameraDialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cameraDialogTitle"
                    >
                        <div className="cameraDialogHeader">
                            <h2 id="cameraDialogTitle">Chụp ảnh bài tập</h2>
                            <button
                                className="removeImageButton"
                                type="button"
                                onClick={() => setIsCameraOpen(false)}
                                aria-label="Đóng camera"
                            >
                                ×
                            </button>
                        </div>
                        <video
                            ref={cameraVideoRef}
                            className="cameraVideo"
                            autoPlay
                            playsInline
                            muted
                        />
                        {isCameraLoading && (
                            <p className="muted">Đang mở camera…</p>
                        )}
                        {cameraError && (
                            <p className="error" role="alert">
                                {cameraError}
                            </p>
                        )}
                        <div className="cameraControls">
                            <button
                                className="secondary"
                                type="button"
                                onClick={() =>
                                    setCameraFacingMode((mode) =>
                                        mode === "environment"
                                            ? "user"
                                            : "environment",
                                    )
                                }
                                disabled={isCameraLoading}
                            >
                                {cameraFacingMode === "environment"
                                    ? "↔ Đổi sang camera trước"
                                    : "↔ Đổi sang camera sau"}
                            </button>
                            <button
                                className="primary"
                                type="button"
                                onClick={captureCameraImage}
                                disabled={isCameraLoading || Boolean(cameraError)}
                            >
                                Chụp ảnh
                            </button>
                        </div>
                        <p className="cameraPermissionNote">
                            Trình duyệt sẽ hỏi quyền dùng camera. Trên mạng,
                            website cần HTTPS để mở camera.
                        </p>
                    </section>
                </div>
            )}
        </section>
    );
}
function App() {
    // view xác định tab hiện tại; selectedLesson chỉ có giá trị ở trang chi tiết bài.
    const [view, setView] = useState("home");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [selectedLesson, setSelectedLesson] = useState(null);
    const [content, setContent] = useState(null);
    const [error, setError] = useState("");
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [authNotice, setAuthNotice] = useState("");
    // userDisplayName = `, ${user.displayName}`;

    // Chỉ tải học liệu sau khi đã xác thực tài khoản.
    useEffect(() => {
        if (!user) {
            setContent(null);
            setError("");
            return undefined;
        }
        let active = true;
        getContent()
            .then((result) => {
                if (active) setContent(result);
            })
            .catch((err) => {
                if (active) setError(err.message);
            });
        return () => {
            active = false;
        };
    }, [user?.id]);

    useEffect(() => {
        let active = true;
        getAccount()
            .then((result) => {
                if (!active) return;
                setUser(result.user);
                if (result.notice) setAuthNotice(result.notice);
                if (!result.user) setAuthDialogOpen(true);
            })
            .catch((requestError) => {
                if (!active) return;
                setAuthNotice(requestError.message);
                setAuthDialogOpen(true);
            })
            .finally(() => {
                if (active) setAuthLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    async function signOut() {
        setAuthNotice("");
        try {
            await submitAccountAction("logout");
            setUser(null);
            setContent(null);
            setView("home");
            setAuthDialogOpen(true);
        } catch (requestError) {
            setAuthNotice(requestError.message);
        }
    }

    // Cho phép đóng menu mobile bằng phím Escape.
    useEffect(() => {
        function closeMenuOnEscape(event) {
            if (event.key === "Escape") setIsMobileMenuOpen(false);
        }
        window.addEventListener("keydown", closeMenuOnEscape);
        return () => window.removeEventListener("keydown", closeMenuOnEscape);
    }, []);
    if (authLoading)
        return (
            <div className="app">
                <main>
                    <div className="card empty loading">Đang kiểm tra đăng nhập…</div>
                </main>
            </div>
        );
    if (!user)
        return (
            <div className="app">
                <header className="top">
                    <div className="brand">
                        <div className="logo"></div>
                        <div>
                            MathHistory <span>AI</span>
                        </div>
                    </div>
                </header>
                <main className="authMain">
                    {authNotice && (
                        <p className="authNotice" role="alert">
                            {authNotice}
                        </p>
                    )}
                    <AccountDialog
                        required
                        onAuthenticated={(signedInUser) => {
                            setUser(signedInUser);
                            setAuthDialogOpen(false);
                            setAuthNotice("");
                        }}
                    />
                    <PublicSearchIntro />
                </main>
                <footer className="footer">
                    <div>MathHistory AI · Học liệu lịch sử Toán học</div>
                    <small className="footerAuthor">
                        by Lê Hồ Hoàng Huy
                    </small>
                </footer>
            </div>
        );
    if (error)
        return (
            <div className="app">
                <main>
                    <div className="card empty">{error}</div>
                </main>
            </div>
        );
    if (!content)
        return (
            <div className="app">
                <main>
                    <div className="card empty loading">Đang tải học liệu…</div>
                </main>
            </div>
        );
    function openLesson(lesson) {
        setSelectedLesson(lesson);
        setView("lesson");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Trang chi tiết quay lại thư viện và đưa người dùng lên đầu trang.
    function returnToLibrary() {
        setSelectedLesson(null);
        setView("library");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function addCreatedLesson(lesson, timelineEntry) {
        setContent((current) =>
            current
                ? {
                      ...current,
                      lessons: [...current.lessons, lesson],
                      timeline: [...current.timeline, timelineEntry],
                  }
                : current,
        );
    }
    const pages = {
        home: (
            <Home
                setView={setView}
                lessons={content.lessons}
                timeline={content.timeline}
                onReadMore={openLesson}
            />
        ),
        library: (
            <Library
                lessons={content.lessons}
                onReadMore={openLesson}
                user={user}
                onLessonCreated={addCreatedLesson}
                librarySchemaReady={content.librarySchemaReady}
                librarySchemaWarning={content.librarySchemaWarning}
            />
        ),
        timeline: <TimelineView timeline={content.timeline} />,
        ai: <AIView displayName={user.displayName || user.username} />,
        assignments: user ? (
            <AssignmentsView user={user} />
        ) : (
            <section className="view active">
                <Header
                    title="Bài tập Toán học"
                    text="Đăng nhập để xem, làm và nộp bài tập."
                />
                <button
                    className="primary"
                    type="button"
                    onClick={() => setAuthDialogOpen(true)}
                >
                    Đăng nhập hoặc đăng ký
                </button>
            </section>
        ),
        users:
            user && ["admin", "super_admin"].includes(user.role) ? (
                <UserManagementView
                    user={user}
                    onCurrentUserUpdated={setUser}
                />
            ) : (
                <Home
                    setView={setView}
                    lessons={content.lessons}
                    timeline={content.timeline}
                    onReadMore={openLesson}
                />
            ),
        lesson: selectedLesson ? (
            <LessonDetail lesson={selectedLesson} onBack={returnToLibrary} />
        ) : (
            <Library
                lessons={content.lessons}
                onReadMore={openLesson}
                user={user}
                onLessonCreated={addCreatedLesson}
                librarySchemaReady={content.librarySchemaReady}
                librarySchemaWarning={content.librarySchemaWarning}
            />
        ),
    };
    const visibleNavItems =
        user && ["admin", "super_admin"].includes(user.role)
            ? [...navItems, ["users", "Quản lý tài khoản"]]
            : navItems;
    // Điều hướng phía client: đổi nội dung trang mà không tải lại toàn bộ website.
    return (
        <div className="app">
            <header className="top">
                <div className="brand">
                    <div className="logo"></div>
                    <div>
                        MathHistory <span>AI</span>
                    </div>
                </div>
                <nav
                    id="main-navigation"
                    className={isMobileMenuOpen ? "mobileMenuOpen" : ""}
                >
                    {visibleNavItems.map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => {
                                setView(id);
                                setIsMobileMenuOpen(false);
                            }}
                            className={
                                view === id ||
                                (view === "lesson" && id === "library")
                                    ? "active"
                                    : ""
                            }
                        >
                            {label}
                        </button>
                    ))}
                </nav>
                {isMobileMenuOpen && (
                    <button
                        className="mobileMenuBackdrop"
                        type="button"
                        aria-label="Đóng menu"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                )}
                <div className="headerActions">
                    {authLoading ? (
                        <span className="muted">Đang tải tài khoản…</span>
                    ) : user ? (
                        <AccountMenu
                            user={user}
                            onEmail={() => setEmailDialogOpen(true)}
                            onPassword={() => setPasswordDialogOpen(true)}
                            onSignOut={signOut}
                        />
                    ) : (
                        <button
                            className="accountButton"
                            type="button"
                            onClick={() => setAuthDialogOpen(true)}
                        >
                            Đăng nhập / Đăng ký
                        </button>
                    )}
                    <button
                        className="mobileMenuToggle"
                        type="button"
                        aria-label={isMobileMenuOpen ? "Đóng menu" : "Mở menu"}
                        aria-expanded={isMobileMenuOpen}
                        aria-controls="main-navigation"
                        onClick={() =>
                            setIsMobileMenuOpen((isOpen) => !isOpen)
                        }
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                </div>
            </header>
            <main>
                {authNotice && (
                    <p className="authNotice" role="alert">
                        {authNotice}
                    </p>
                )}
                {pages[view]}
            </main>
            {authDialogOpen && (
                <AccountDialog
                    onClose={() => setAuthDialogOpen(false)}
                    onAuthenticated={(signedInUser) => {
                        setUser(signedInUser);
                        setAuthDialogOpen(false);
                        setAuthNotice("");
                        setView("home");
                    }}
                />
            )}
            {emailDialogOpen && (
                <EmailVerificationDialog
                    user={user}
                    onClose={() => setEmailDialogOpen(false)}
                    onVerified={(verifiedUser) => {
                        setUser(verifiedUser);
                        setEmailDialogOpen(false);
                        setAuthNotice("Email đã được xác thực và liên kết.");
                    }}
                />
            )}
            {passwordDialogOpen && (
                <PasswordChangeDialog
                    onClose={() => setPasswordDialogOpen(false)}
                    onChanged={() => {
                        setPasswordDialogOpen(false);
                        setAuthNotice("Mật khẩu đã được đổi thành công.");
                    }}
                />
            )}
            <footer className="footer">
                <div>MathHistory AI · Học liệu lịch sử Toán học</div>
                <small className="footerAuthor">by Lê Hồ Hoàng Huy</small>
            </footer>
        </div>
    );
}

function PublicSearchIntro() {
    return (
        <section className="publicSearchIntro" aria-labelledby="public-search-title">
            <div className="sectionHead">
                <div>
                    <span className="tag">Khám phá Toán học</span>
                    <h2 id="public-search-title">
                        Tìm hiểu lịch sử Toán học qua các thời đại
                    </h2>
                    <p className="muted">
                        MathHistory AI giới thiệu những câu chuyện về cách con
                        người phát triển toán học, từ nhu cầu đo đạc và tính
                        toán trong các nền văn minh cổ đại đến những ý tưởng
                        vẫn được học ngày nay.
                    </p>
                </div>
            </div>
            <div className="grid publicSearchTopics">
                <article className="card">
                    <h3>Nhà toán học và phát minh</h3>
                    <p>
                        Tìm hiểu Euclid, Pythagoras, Archimedes và Al-Khwarizmi;
                        khám phá các công trình đã góp phần định hình lịch sử
                        toán học.
                    </p>
                </article>
                <article className="card">
                    <h3>Đại số và hình học</h3>
                    <p>
                        Khám phá nguồn gốc của đại số, phương trình, hình học
                        cổ đại và cách các phương pháp toán học được hệ thống
                        hóa qua nhiều thế kỷ.
                    </p>
                </article>
                <article className="card">
                    <h3>Toán học qua các nền văn minh</h3>
                    <p>
                        Từ Ai Cập cổ đại đến Baghdad thời Trung cổ, tìm hiểu
                        lịch sử con số, phép tính và vai trò của toán học trong
                        đời sống.
                    </p>
                </article>
            </div>
            <p className="muted publicSearchNote">
                Phần giới thiệu này có thể xem công khai. Học liệu chi tiết, bài
                tập và trợ giảng AI yêu cầu đăng nhập.
            </p>
        </section>
    );
}

// Entry component được main.jsx mount vào #root.
export default App;
