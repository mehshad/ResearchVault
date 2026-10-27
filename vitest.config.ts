import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Component tests only. The unit tests under server/, shared/ and
 * client/src/lib run on node:test (`npm run test:unit`); this runner takes
 * the *.test.tsx files, which need a DOM, React and the testing library.
 * Keeping the include narrow is what stops the two runners from picking up
 * each other's files.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["client/src/**/*.test.tsx"],
    setupFiles: ["client/src/test/setup.ts"],
    globals: false,
  },
});
