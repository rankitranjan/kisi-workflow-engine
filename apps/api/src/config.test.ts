import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://kisi:kisi@localhost:5432/workflow_engine",
    PUBLIC_URL: "https://api.example.com",
    CORS_ORIGIN: "https://app.example.com",
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

describe("loadConfig origins", () => {
  it("maps PUBLIC_URL to the API public URL", () => {
    const config = loadConfig(
      env({
        PUBLIC_URL: "https://api.example.com/base",
        CORS_ORIGIN: "https://app.example.com",
      }),
    );

    expect(config.publicUrl).toBe("https://api.example.com/base");
  });

  it("maps CORS_ORIGIN to the frontend origin", () => {
    expect(loadConfig(env({ CORS_ORIGIN: "https://app.example.com/console/" })).corsOrigin).toBe(
      "https://app.example.com",
    );
  });

  it("rejects a missing CORS_ORIGIN", () => {
    const input = env();
    delete input.CORS_ORIGIN;
    expect(() => loadConfig(input)).toThrow();
  });
});
