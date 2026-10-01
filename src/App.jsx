import React, { useEffect, useMemo, useState } from "react";
import {
    chatWithAI,
    getContent,
    getProgress,
    submitQuiz,
} from "./services/api.js";

const navItems = [
    ["home", "Trang chủ"],
    ["library", "Thư viện"],
    ["timeline", "Dòng thời gian"],
    ["ai", "AI trợ giảng"],
    ["dashboard", "Tiến độ"],
];

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
function Stat({ value, label }) {
    return (
        <div className="stat">
            <b>{value}</b>
            <small>{label}</small>
        </div>
    );
}
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
function Empty({ text }) {
    return <div className="card empty">{text}</div>;
}
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
function AIView() {
    const [messages, setMessages] = useState([
        {
            role: "bot",
            text: "Xin chào! Mình có thể giúp bạn giải thích một chủ đề lịch sử Toán, tóm tắt bài học hoặc tạo câu hỏi ôn tập.",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    async function ask() {
        const v = input.trim();
        if (!v || loading) return;
        setError("");
        setMessages((m) => [...m, { role: "me", text: v }]);
        setLoading(true);
        try {
            const data = await chatWithAI(v);
            if (!data.answer)
                throw new Error("Dịch vụ AI không trả về nội dung.");
            setInput("");
            setMessages((m) => [
                ...m,
                {
                    role: "bot",
                    text: data.answer,
                },
            ]);
        } catch (err) {
            setError(err.message || "Không thể nhận phản hồi từ AI.");
        } finally {
            setLoading(false);
        }
    }
    return (
        <section className="view active">
            <Header
                title="AI trợ giảng"
                text="Đặt câu hỏi để hiểu bài theo cách đơn giản hơn."
            />
            <div className="ai">
                <div className="chat">
                    <div className="messages">
                        {messages.map((m, i) => (
                            <div className={`bubble ${m.role}`} key={i}>
                                {m.text}
                            </div>
                        ))}
                        {loading && (
                            <div className="bubble bot">Đang suy nghĩ…</div>
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
                <div className="card">
                    <span className="tag">Các chức năng</span>
                    <h3>AI học cùng bạn</h3>
                    <p>
                        • Giải thích khái niệm
                        <br />• Tóm tắt bài học
                        <br />• Tạo câu hỏi luyện tập
                        <br />• Gợi ý nghiên cứu
                        <br />• Phân tích câu trả lời sai
                        <br />• Gợi ý bài học tiếp theo
                    </p>
                    <hr />
                    <p className="muted">
                        API key không đặt trong trình duyệt; AI sẽ được gọi qua
                        backend.
                    </p>
                </div>
            </div>
        </section>
    );
}
function Dashboard({ quiz }) {
    const [selected, setSelected] = useState(null);
    const [progress, setProgress] = useState(null);
    const [progressError, setProgressError] = useState("");
    const [quizResult, setQuizResult] = useState(null);
    const [quizLoading, setQuizLoading] = useState(false);
    const [quizError, setQuizError] = useState("");
    useEffect(() => {
        getProgress()
            .then((data) => {
                setProgress(data);
                setProgressError("");
            })
            .catch((err) => setProgressError(err.message));
    }, []);
    const completed = progress?.lessonsCompleted ?? 0;
    const total = progress?.lessonsTotal ?? 0;
    async function submitSelectedAnswer() {
        if (selected === null || quizLoading) return;
        setQuizLoading(true);
        setQuizError("");
        setQuizResult(null);
        try {
            const result = await submitQuiz(selected);
            setQuizResult(result);
            setProgress((previous) =>
                previous
                    ? {
                          ...previous,
                          quizzesCompleted: result.quizzesCompleted,
                          averageScore: result.averageScore,
                      }
                    : previous,
            );
        } catch (error) {
            setQuizError(error.message);
        } finally {
            setQuizLoading(false);
        }
    }
    return (
        <section className="view active">
            <Header
                title="Tiến độ học tập"
                text="Số liệu được lấy từ API lưu trữ của ứng dụng."
            />
            <div className="dash">
                <StatCard
                    label="Bài đã học"
                    value={progress ? completed : "—"}
                />
                <StatCard
                    label="Quiz đã làm"
                    value={progress?.quizzesCompleted ?? "—"}
                />
                <StatCard
                    label="Điểm trung bình"
                    value={
                        progress?.averageScore == null
                            ? "—"
                            : `${progress.averageScore}%`
                    }
                />
                <StatCard
                    label="Chuỗi học"
                    value={
                        progress?.streakDays == null
                            ? "—"
                            : `${progress.streakDays} ngày`
                    }
                />
            </div>
            <div className="section">
                <div className="card">
                    <h3>Tiến độ khóa khám phá</h3>
                    <div className="progress">
                        <i
                            style={{
                                width: total
                                    ? `${Math.round((completed / total) * 100)}%`
                                    : "0%",
                            }}
                        />
                    </div>
                    <p className="muted">
                        {progressError
                            ? progressError
                            : progress
                              ? `${completed}/${total} bài đã hoàn thành.`
                              : "Đang tải tiến độ…"}
                    </p>
                </div>
            </div>
            <div className="section">
                <div className="quiz">
                    <span className="tag">Quiz</span>
                    <h3>{quiz.question}</h3>
                    {quiz.options.map((x, i) => (
                        <button
                            key={x}
                            className={`option ${selected === i ? "selected" : ""}`}
                            onClick={() => setSelected(i)}
                        >
                            {String.fromCharCode(65 + i)}. {x}
                        </button>
                    ))}
                    <button
                        className="primary"
                        onClick={submitSelectedAnswer}
                        disabled={selected === null || quizLoading}
                    >
                        {quizLoading ? "Đang lưu…" : "Nộp bài"}
                    </button>
                    {quizError && (
                        <p className="error" role="alert">
                            {quizError}
                        </p>
                    )}
                    {quizResult && (
                        <p className="result">
                            {quizResult.correct
                                ? "✅ Chính xác!"
                                : "ℹ️ Chưa chính xác, hãy đối chiếu tài liệu."}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
function StatCard({ label, value }) {
    return (
        <div className="card">
            <small className="muted">{label}</small>
            <b className="big">{value}</b>
        </div>
    );
}
function App() {
    const [view, setView] = useState("home");
    const [selectedLesson, setSelectedLesson] = useState(null);
    const [content, setContent] = useState(null);
    const [error, setError] = useState("");
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
        dashboard: <Dashboard quiz={content.quiz} />,
        lesson: selectedLesson ? (
            <LessonDetail lesson={selectedLesson} onBack={returnToLibrary} />
        ) : (
            <Library lessons={content.lessons} onReadMore={openLesson} />
        ),
    };
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
export default App;
