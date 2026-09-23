import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/integration/**/*.integration.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
    env: {
      DATABASE_URL: "postgresql://kisi:kisi@localhost:5432/workflow_engine_test",
      PUBLIC_URL: "https://api.example.com",
      DEMO_ACCESS_KEY: "test-demo-key",
    },
  },
});
