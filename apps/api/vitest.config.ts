import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://kisi:kisi@localhost:5432/workflow_engine",
      PUBLIC_URL: "https://api.example.com",
      DEMO_ACCESS_KEY: "test-demo-key",
    },
  },
});
