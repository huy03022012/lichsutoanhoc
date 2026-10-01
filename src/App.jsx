import React, { useEffect, useMemo, useState } from "react";
import ChatMessage from "./components/chat/ChatMessage.jsx";
import {
    chatWithAI,
    getContent,
} from "./services/api.js";

// Danh sách tab được dùng để vẽ thanh điều hướng và chọn màn hình tương ứng.
const navItems = [
    ["home", "Trang chủ"],
    ["library", "Thư viện"],
    ["timeline", "Dòng thời gian"],
    ["ai", "AI trợ giảng"],
];

// sessionStorage giữ lịch sử riêng cho từng tab trình duyệt và tự hết khi đóng tab.
const AI_CHAT_STORAGE_KEY = "mathhistory-ai-conversations-v1";
// Đọc khóa cũ một lần để không làm mất lịch sử đã lưu trước khi hỗ trợ nhiều cuộc chat.
const LEGACY_AI_CHAT_STORAGE_KEY = "mathhistory-ai-chat-v1";
const initialAiMessages = [
    {
        role: "bot",
        text: "Xin chào! Mình có thể giúp bạn giải thích một chủ đề lịch sử Toán, tóm tắt bài học hoặc tạo câu hỏi ôn tập.",
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
        const saved = sessionStorage.getItem(AI_CHAT_STORAGE_KEY);
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

        const legacyMessages = sessionStorage.getItem(
            LEGACY_AI_CHAT_STORAGE_KEY,
        );
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
            <button className="secondary" onClick={() => onReadMore(lesson)}>
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
function Library({ lessons, onReadMore }) {
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const filtered = useMemo(
        () =>
            lessons.filter((x) =>
                `${x.title} ${x.desc} ${x.key}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [query, lessons],
    );
    return (
        <section className="view active">
            <Header
                title="Thư viện lịch sử Toán học"
                text="Tìm kiếm bài học, nhà toán học và chủ đề."
            />
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
                <section className="sourcesSection" aria-labelledby="sources-title">
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
                        Mở nguồn trong tab mới để đọc thêm và đối chiếu thông tin.
                    </p>
                </section>
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
            <div className="section">
                <div className="card">
                    <span className="tag">Nghiên cứu có trách nhiệm</span>
                    <h3>Kiểm chứng trước khi tin</h3>
                    <p>
                        AI có thể hỗ trợ tìm hiểu và trình bày, nhưng nội dung
                        lịch sử cần được đối chiếu với các nguồn uy tín.
                    </p>
                </div>
            </div>
        </section>
    );
}
// Khu vực chat: quản lý danh sách 10 cuộc gần đây, trạng thái gửi và lưu phiên.
function AIView() {
    // State chat gồm danh sách cuộc, ID đang mở, nội dung nhập, trạng thái gửi và giao diện phóng to.
    const [chatState, setChatState] = useState(readSavedAiConversations);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isExpanded, setIsExpanded] = useState(false);
    const activeConversation =
        chatState.conversations.find(
            (conversation) => conversation.id === chatState.activeId,
        ) ?? chatState.conversations[0];
    const messages = activeConversation.messages;

    // Ghi mọi thay đổi vào phiên hiện tại; lỗi lưu không làm sập giao diện chat.
    useEffect(() => {
        try {
            sessionStorage.setItem(
                AI_CHAT_STORAGE_KEY,
                JSON.stringify(chatState),
            );
            sessionStorage.removeItem(LEGACY_AI_CHAT_STORAGE_KEY);
        } catch (storageError) {
            console.error(
                "Không thể lưu lịch sử trò chuyện trong phiên:",
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

            const conversation = createConversation();
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
    }

    // Xóa toàn bộ cuộc chat sau khi người dùng xác nhận.
    function clearConversationHistory() {
        if (loading || !window.confirm("Bạn muốn xóa toàn bộ lịch sử trò chuyện?")) {
            return;
        }
        const conversation = createConversation();
        setChatState({
            conversations: [conversation],
            activeId: conversation.id,
        });
        setError("");
        setInput("");
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
                conversations.length > 0 ? conversations : [createConversation()];
            const activeId =
                current.activeId === conversationId
                    ? remaining[0].id
                    : current.activeId;

            return { conversations: remaining, activeId };
        });
        setError("");
        setInput("");
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

    // Gửi câu hỏi lên backend; chỉ giữ câu hỏi trong lịch sử khi gọi API thành công.
    async function ask() {
        const v = input.trim();
        if (!v || loading) return;
        setError("");
        const messageId = `${Date.now()}-${Math.random()}`;
        const conversationId = activeConversation.id;
        // Gắn ID tạm cho câu hỏi để có thể gỡ riêng nếu request thất bại.
        updateConversation(conversationId, (current) => [
            ...current,
            { role: "me", text: v, id: messageId },
        ]);
        setLoading(true);
        try {
            const data = await chatWithAI(v);
            if (!data.answer)
                throw new Error("Dịch vụ AI không trả về nội dung.");
            setInput("");
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
        } finally {
            setLoading(false);
        }
    }
    // Chọn hội thoại đang hiển thị; sidebar và vùng chat cùng đọc state này.
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
                        <span className="muted">Trò chuyện với AI</span>
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
                    <div className="messages">
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
                    <div className="chatbar">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && ask()}
                            disabled={loading}
                            placeholder="Hỏi về lịch sử Toán..."
                        />
                        <button
                            className="primary"
                            onClick={ask}
                            disabled={loading || !input.trim()}
                        >
                            {loading ? "Đang gửi…" : "Gửi"}
                        </button>
                    </div>
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
function App() {
    // view xác định tab hiện tại; selectedLesson chỉ có giá trị ở trang chi tiết bài.
    const [view, setView] = useState("home");
    const [selectedLesson, setSelectedLesson] = useState(null);
    const [content, setContent] = useState(null);
    const [error, setError] = useState("");

    // Tải nội dung ban đầu một lần; trang có trạng thái tải và lỗi riêng.
    useEffect(() => {
        getContent()
            .then(setContent)
            .catch((err) => setError(err.message));
    }, []);
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
                    <div className="card empty">Đang tải học liệu…</div>
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
            />
        ),
        timeline: <TimelineView timeline={content.timeline} />,
        ai: <AIView />,
        lesson: selectedLesson ? (
            <LessonDetail lesson={selectedLesson} onBack={returnToLibrary} />
        ) : (
            <Library lessons={content.lessons} onReadMore={openLesson} />
        ),
    };

    // Điều hướng phía client: đổi nội dung trang mà không tải lại toàn bộ website.
    return (
        <div className="app">
            <header className="top">
                <div className="brand">
                    <div className="logo">∑</div>
                    <div>
                        MathHistory <span>AI</span>
                    </div>
                </div>
                <nav>
                    {navItems.map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setView(id)}
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
                <button className="profile" type="button">
                    👤 Học sinh
                </button>
            </header>
            <main>{pages[view]}</main>
            <footer className="footer">
                MathHistory AI · Học liệu lịch sử Toán học được phục vụ từ API
                backend.
            </footer>
        </div>
    );
}
// Entry component được main.jsx mount vào #root.
export default App;
