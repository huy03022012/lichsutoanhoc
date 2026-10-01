import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    preview: { host: "0.0.0.0", port: 4173 },
    // Chuyển tiếp API khi chạy frontend bằng Vite trong môi trường phát triển.
    server: {
        host: "0.0.0.0",
        port: 5173,
        proxy: { "/api": "http://localhost:3000" },
    },
});
