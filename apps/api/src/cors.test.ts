import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { InMemoryWorkflowRepository } from "./db/in-memory-workflow-repository.js";
import { InMemoryWorkflowRunRepository } from "./db/in-memory-workflow-run-repository.js";

const DEMO_KEY = "test-demo-key";
const PUBLIC_URL = "https://workflow.example.com";
const OTHER_ORIGIN = "https://evil.example";

const PREFLIGHT_HEADERS = {
  origin: PUBLIC_URL,
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

async function startApp(publicUrl = PUBLIC_URL): Promise<FastifyInstance> {
  return buildApp({
    repository: new InMemoryWorkflowRepository(),
    runRepository: new InMemoryWorkflowRunRepository(),
    config: {
      publicUrl,
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

  it("answers an OPTIONS preflight from the PUBLIC_URL origin without x-demo-key", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/workflows",
      headers: PREFLIGHT_HEADERS,
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(PUBLIC_URL);
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

  it("still requires x-demo-key for the actual workflow request", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: { origin: PUBLIC_URL },
    });

    expect(response.statusCode).toBe(401);
  });

  it("allows the actual workflow request from the PUBLIC_URL origin when authenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: {
        origin: PUBLIC_URL,
        "x-demo-key": DEMO_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(PUBLIC_URL);
  });
});
