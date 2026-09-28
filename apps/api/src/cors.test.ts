import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { InMemoryWorkflowRepository } from "./db/in-memory-workflow-repository.js";
import { InMemoryWorkflowRunRepository } from "./db/in-memory-workflow-run-repository.js";

const DEMO_KEY = "test-demo-key";
const PUBLIC_URL = "https://api.example.com";
const CORS_ORIGIN = "https://app.example.com";
const OTHER_ORIGIN = "https://evil.example";

const PREFLIGHT_HEADERS = {
  origin: CORS_ORIGIN,
  "access-control-request-method": "GET",
  "access-control-request-headers": "x-demo-key, content-type",
};

function headerList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

async function startApp(): Promise<FastifyInstance> {
  return buildApp({
    repository: new InMemoryWorkflowRepository(),
    runRepository: new InMemoryWorkflowRunRepository(),
    config: {
      publicUrl: PUBLIC_URL,
      corsOrigin: CORS_ORIGIN,
      demoAccessKey: DEMO_KEY,
      bodyLimitBytes: 256 * 1024,
      allowPrivateUrls: false,
    },
    logger: false,
  });
}

describe("CORS preflight", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await startApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("answers an OPTIONS preflight from the CORS_ORIGIN without x-demo-key", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/workflows",
      headers: PREFLIGHT_HEADERS,
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(CORS_ORIGIN);
    expect(headerList(response.headers["access-control-allow-methods"])).toEqual(
      expect.arrayContaining(["get", "post", "put", "patch", "delete", "options"]),
    );
    expect(headerList(response.headers["access-control-allow-headers"])).toEqual(
      expect.arrayContaining(["x-demo-key", "content-type"]),
    );
  });

  it("does not allow an arbitrary origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/workflows",
      headers: {
        ...PREFLIGHT_HEADERS,
        origin: OTHER_ORIGIN,
      },
    });

    expect(response.headers["access-control-allow-origin"]).not.toBe(OTHER_ORIGIN);
  });

  it("does not allow the API PUBLIC_URL as a CORS origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/workflows",
      headers: {
        ...PREFLIGHT_HEADERS,
        origin: PUBLIC_URL,
      },
    });

    expect(response.headers["access-control-allow-origin"]).not.toBe(PUBLIC_URL);
  });

  it("still requires x-demo-key for the actual workflow request", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: { origin: CORS_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("allows the actual workflow request from the CORS_ORIGIN when authenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: {
        origin: CORS_ORIGIN,
        "x-demo-key": DEMO_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(CORS_ORIGIN);
  });
});
