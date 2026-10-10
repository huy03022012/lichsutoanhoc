import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import "./chat-message.css";

// Tin nhắn chat render khác nhau giữa bot và người dùng: bot hiển thị Markdown kèm
// KaTeX để giữ nguyên định dạng phương trình, còn người dùng có thể kèm ảnh và
// văn bản thuần. Cách render tách biệt này giữ độ tương tác của chat nhưng vẫn
// tránh lẫn nội dung AI với hình ảnh do người dùng gửi.
// Định dạng Markdown và công thức của AI; tin nhắn người dùng hiển thị dạng văn bản thường.
export default function ChatMessage({ message }) {
    const isBot = message.role === "bot";

    return (
        <div className={`bubble ${isBot ? "bot" : "me"}`}>
            {isBot ? (
                <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                >
                    {message.text}
                </ReactMarkdown>
            ) : (
                <>
                    {message.imageData ? (
                        <img
                            className="chatImage"
                            src={message.imageData}
                            alt={`Ảnh bài tập: ${message.imageName || "đã gửi"}`}
                        />
                    ) : (
                        message.imageName && (
                            <div className="previousImageNotice">
                                📷 Ảnh đã gửi: {message.imageName}
                            </div>
                        )
                    )}
                    {message.text}
                </>
            )}
        </div>
    );
}
