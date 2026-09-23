import path from "node:path";

import { defineConfig } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const databaseUrl = "postgresql://kisi:kisi@127.0.0.1:5433/workflow_engine_e2e";
const demoAccessKey = "e2e-demo-key";
// z.httpUrl() rejects IP addresses and bare "localhost". This name passes that
// check and resolves to loopback, so the trigger URL shown in the UI is reachable.
const publicUrl = "http://api.localhost:3000";

function processEnv(overrides: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      base[key] = value;
    }
  }
  return { ...base, ...overrides };
}

export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start -w @kisi-workflow/api",
      cwd: repoRoot,
      port: 3000,
      reuseExistingServer: false,
      timeout: 120_000,
      env: processEnv({
        DATABASE_URL: databaseUrl,
        PUBLIC_URL: publicUrl,
        DEMO_ACCESS_KEY: demoAccessKey,
        PORT: "3000",
        ALLOW_PRIVATE_URLS: "true",
      }),
    },
    {
      command: "npm run dev -w @kisi-workflow/web -- --config ../../e2e/vite.config.mjs --host 127.0.0.1 --port 5173 --strictPort",
      cwd: repoRoot,
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 120_000,
      env: processEnv({
        VITE_DEMO_ACCESS_KEY: demoAccessKey,
      }),
    },
  ],
});
