import { lessons, quiz, timeline } from "../src/data/content.js";

export default function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
    }

    return res.status(200).json({
        lessons,
        timeline,
        quiz: { question: quiz.question, options: quiz.options },
    });
}
