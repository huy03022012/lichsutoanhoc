import fs from "node:fs/promises";
import path from "node:path";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).end();
    }

    const { name, w, h, size } = req.query;
    if (typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).end();
    }

    let width;
    let height;
    if (size !== undefined) {
        if (
            typeof size !== "string" ||
            !/^[1-9]\d*$/.test(size) ||
            w !== undefined ||
            h !== undefined
        ) {
            return res.status(400).end();
        }
        width = height = Number(size);
    } else {
        if (
            typeof w !== "string" ||
            typeof h !== "string" ||
            !/^[1-9]\d*$/.test(w) ||
            !/^[1-9]\d*$/.test(h)
        ) {
            return res.status(400).end();
        }
        width = Number(w);
        height = Number(h);
    }

    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width > 4096 ||
        height > 4096
    ) {
        return res.status(400).end();
    }

    const filePath = path.join(process.cwd(), "private", "svg", `${name}.svg`);
    try {
        const source = await fs.readFile(filePath, "utf8");
        let hasRootElement = false;
        const svg = source.replace(
            /<svg\b([^>]*?)(\/?)>/i,
            (_tag, attributes, selfClosing) => {
                hasRootElement = true;
                const withoutDimensions = attributes.replace(
                    /\s+(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
                    "",
                );
                return `<svg${withoutDimensions} width="${width}" height="${height}"${selfClosing}>`;
            },
        );
        if (!hasRootElement) {
            console.error(`SVG asset "${name}" does not contain a root <svg> element.`);
            return res.status(500).end();
        }

        res.status(200);
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
        res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
        return res.send(svg);
    } catch (error) {
        if (error?.code === "ENOENT") {
            return res.status(404).end();
        }
        console.error(`Failed to read SVG asset "${name}":`, error);
        return res.status(500).end();
    }
}
