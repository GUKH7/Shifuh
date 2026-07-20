import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3217",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "cross-env NEXT_DIST_DIR=.next-e2e npm run start -- --port 3217",
    url: "http://127.0.0.1:3217",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
