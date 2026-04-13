import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30000,
  retries: 0,
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:5173",
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
