import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://kisi:kisi@localhost:5432/workflow_engine",
    PUBLIC_URL: "https://api.example.com",
    DEMO_ACCESS_KEY: "test-demo-key",
    ...overrides,
  };
}

describe("loadConfig ALLOW_PRIVATE_URLS", () => {
  it("defaults to false when the variable is omitted", () => {
    expect(loadConfig(env()).allowPrivateUrls).toBe(false);
  });

  it("accepts the string false", () => {
    expect(loadConfig(env({ ALLOW_PRIVATE_URLS: "false" })).allowPrivateUrls).toBe(false);
  });

  it("accepts the string true", () => {
    expect(loadConfig(env({ ALLOW_PRIVATE_URLS: "true" })).allowPrivateUrls).toBe(true);
  });

  it("rejects any other string", () => {
    expect(() => loadConfig(env({ ALLOW_PRIVATE_URLS: "yes" }))).toThrow();
  });
});
