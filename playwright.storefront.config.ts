import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "storefront-visual.spec.ts",
  fullyParallel: true,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/storefront-visual", open: "never" }],
  ],
  outputDir: "test-results/storefront-visual",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
