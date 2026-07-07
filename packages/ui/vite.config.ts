import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@adhd/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/pipelines": "http://localhost:9477",
      "/runs": "http://localhost:9477",
      "/health": "http://localhost:9477",
    },
  },
});
