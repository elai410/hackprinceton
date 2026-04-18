import { defineConfig } from "vite";

export default defineConfig({
  // Companion URL is set via VITE_COMPANION_URL in web/.env
  // The browser calls it directly — no proxy needed for MVP.
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
