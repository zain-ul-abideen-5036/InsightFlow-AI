import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Playwright specs live in e2e/ and run under a different runner.
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
});
