import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "admin-visual-audit.spec.ts",
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/visual-audit", open: "never" }],
  ],
  outputDir: "test-results/visual-audit",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
