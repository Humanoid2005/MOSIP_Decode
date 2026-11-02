import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Relative asset URLs (base "./") let the same build load at the site root and
// under the gateway's /playground/ prefix. The dev server keeps port 5173
// strictly because the server's default client origin, used for its origin
// allowlist and the mock wallet's callback URL, expects it. /api, including
// the WebSocket at /api/v1/events, is proxied to the playground server, which
// API_TARGET can override.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "./",
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target: env.API_TARGET || "http://127.0.0.1:8000", ws: true },
      },
    },
  };
});
