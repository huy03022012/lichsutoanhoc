import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import "./chat-message.css";

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
                message.text
            )}
        </div>
    );
}
