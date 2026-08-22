import { defineConfig, devices } from "@playwright/test";

const usesExternalServer =
  process.env.FACETSMITH_E2E_EXTERNAL_SERVER === "true";

export default defineConfig({
  testDir: "./examples/next-app/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  ...(usesExternalServer
    ? {}
    : {
        webServer: {
          command:
            "corepack pnpm --filter @facet-smith/next-app dev --port 3100",
          url: "http://127.0.0.1:3100",
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            NEXT_PUBLIC_EXPERIMENT_INSPECTOR: "true",
            NEXT_PUBLIC_DEPLOYMENT_ENV: "development",
          },
        },
      }),
});
