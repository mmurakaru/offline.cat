import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // capture-demo.spec.ts records the homepage video (needs ffmpeg) and is not
  // a regression test. Run it with: CAPTURE_DEMO=1 npx playwright test capture-demo
  testIgnore: process.env.CAPTURE_DEMO ? [] : ["**/capture-demo.spec.ts"],
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
