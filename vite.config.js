import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    // Plugin này cho phép Vite biên dịch JSX của ứng dụng React.
    plugins: [react()],
    preview: { host: "0.0.0.0", port: 4173 },
    // Chuyển /api từ frontend Vite sang Express local trong lúc phát triển.
    server: {
        host: "0.0.0.0",
        port: 5173,
        proxy: { "/api": "http://localhost:3000" },
    },
    build: {
        // Gom font KaTeX thành thư mục riêng; các asset khác vẫn nằm ở assets/.
        rolldownOptions: {
            output: {
                assetFileNames: (assetInfo) =>
                    /\.(woff2?|ttf|otf)$/i.test(assetInfo.name || "")
                        ? "assets/fonts/[name]-[hash][extname]"
                        : "assets/[name]-[hash][extname]",
            },
        },
    },
});
