import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "~": new URL("./app", import.meta.url).pathname,
    },
  },
});
