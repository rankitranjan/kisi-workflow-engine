import { randomUUID } from "node:crypto";

import { ApiErrorSchema, TriggerResponseSchema } from "@kisi-workflow/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { InMemoryWorkflowRepository } from "../db/in-memory-workflow-repository.js";
import { InMemoryWorkflowRunRepository } from "../db/in-memory-workflow-run-repository.js";
import type { WorkflowCreateRecord, WorkflowRepository } from "../db/workflow-repository.js";

const DEMO_KEY = "test-demo-key";
const PUBLIC_URL = "https://api.example.com";
const HEX = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const UNKNOWN_HEX = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const httpStep = {
  type: "http_request" as const,
  method: "POST" as const,
  url: "http://127.0.0.1/alerts",
  timeoutMs: 1000,
  retries: 0,
};

function parseApiError(body: unknown) {
  const parsed = ApiErrorSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  if (!parsed.success) {
    throw new Error("expected api error");
  }
  return parsed.data;
}

function repositoryThatRejectsLookup(): {
  repository: WorkflowRepository;
  lookups: () => number;
} {
  const base = new InMemoryWorkflowRepository();
  let count = 0;
  const repository: WorkflowRepository = {
    list: () => base.list(),
    getById: (id) => base.getById(id),
    create: (input) => base.create(input),
    update: (id, patch) => base.update(id, patch),
    replace: (id, put) => base.replace(id, put),
    deleteById: (id) => base.deleteById(id),
    getByTriggerToken: async () => {
      count += 1;
      throw new Error("lookup");
    },
  };
  return { repository, lookups: () => count };
}

async function startApp(options?: {
  allowPrivateUrls?: boolean;
  fetchImpl?: typeof fetch;
  repository?: WorkflowRepository;
}): Promise<{
  app: FastifyInstance;
  repository: WorkflowRepository;
  runRepository: InMemoryWorkflowRunRepository;
}> {
  const repository = options?.repository ?? new InMemoryWorkflowRepository();
  const runRepository = new InMemoryWorkflowRunRepository();
  const app = await buildApp({
    repository,
    runRepository,
    config: {
      publicUrl: PUBLIC_URL,
      demoAccessKey: DEMO_KEY,
      bodyLimitBytes: 256 * 1024,
      allowPrivateUrls: options?.allowPrivateUrls ?? false,
    },
    fetchImpl: options?.fetchImpl,
    logger: false,
  });
  return { app, repository, runRepository };
}

async function seed(
  repository: WorkflowRepository,
  overrides: Partial<WorkflowCreateRecord> = {},
) {
  return repository.create({
    name: "Unlock alerts",
    enabled: true,
    steps: [],
    triggerToken: HEX,
    triggerPath: `/t/${HEX}`,
    ...overrides,
  });
}

describe("POST /t/:triggerToken", () => {
  let app: FastifyInstance;
  let repository: WorkflowRepository;
  let runRepository: InMemoryWorkflowRunRepository;

  beforeEach(async () => {
    ({ app, repository, runRepository } = await startApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with the public run fields and persists the run", async () => {
    const workflow = await seed(repository);

    const response = await app.inject({
      method: "POST",
      url: `/t/${HEX}`,
      payload: { type: "lock.unlock" },
    });

    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    const parsed = TriggerResponseSchema.parse(body);
    const runs = runRepository.snapshot();
    expect(runs).toHaveLength(1);
    const stored = runs[0];
    if (stored === undefined) {
      throw new Error("expected a persisted run");
    }
    expect(body).toEqual({
      status: "success",
      runId: stored.id,
      workflowId: workflow.id,
      startedAt: stored.startedAt,
      finishedAt: stored.finishedAt,
      error: null,
    });
    expect(parsed.runId).toBe(stored.id);
    expect(stored.status).toBe("success");
    expect(stored.requestBody).toEqual({ type: "lock.unlock" });
  });

  it("executes when x-demo-key is absent", async () => {
    await seed(repository);

    const response = await app.inject({
      method: "POST",
      url: `/t/${HEX}`,
      headers: {},
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(TriggerResponseSchema.parse(response.json()).status).toBe("success");
  });

  it("returns 200 skipped when the filter does not match", async () => {
    const workflow = await seed(repository, {
      steps: [
        {
          type: "filter",
          conditions: [{ path: "type", op: "eq", value: "lock.unlock" }],
        },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: `/t/${HEX}`,
      payload: { type: "other" },
    });

    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    const runs = runRepository.snapshot();
    expect(runs).toHaveLength(1);
    const stored = runs[0];
    if (stored === undefined) {
      throw new Error("expected a persisted run");
    }
    expect(body).toEqual({
      status: "skipped",
      runId: stored.id,
      workflowId: workflow.id,
      startedAt: stored.startedAt,
      finishedAt: stored.finishedAt,
      error: null,
    });
    expect(stored.status).toBe("skipped");
  });

  it("returns 404 for an unknown token and does not persist a run", async () => {
    await seed(repository);

    const response = await app.inject({
      method: "POST",
      url: `/t/${UNKNOWN_HEX}`,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(parseApiError(response.json())).toEqual({ error: "not_found" });
    expect(runRepository.snapshot()).toEqual([]);
  });

  it("returns 403 for a disabled workflow and does not persist a run", async () => {
    await seed(repository, { enabled: false });

    const response = await app.inject({
      method: "POST",
      url: `/t/${HEX}`,
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(parseApiError(response.json())).toEqual({ error: "workflow_disabled" });
    expect(runRepository.snapshot()).toEqual([]);
  });

  it("returns 400 for a non-object JSON body and does not persist a run", async () => {
    await seed(repository);

    for (const payload of ["[]", '"unlock"', "null"]) {
      const response = await app.inject({
        method: "POST",
        url: `/t/${HEX}`,
        headers: { "content-type": "application/json" },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });
    }
    expect(runRepository.snapshot()).toEqual([]);
  });

  it("returns the existing validation_error for invalid JSON and does not persist a run", async () => {
    await seed(repository);

    const response = await app.inject({
      method: "POST",
      url: `/t/${HEX}`,
      headers: { "content-type": "application/json" },
      payload: "{",
    });

    expect(response.statusCode).toBe(400);
    expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });
    expect(runRepository.snapshot()).toEqual([]);
  });

  it("returns 413 when the trigger body exceeds 64 KB", async () => {
    await seed(repository);
    const payload = JSON.stringify({ padding: "x".repeat(70_000) });
    expect(Buffer.byteLength(payload)).toBeGreaterThan(64 * 1024);
    expect(Buffer.byteLength(payload)).toBeLessThan(256 * 1024);

    const trigger = await app.inject({
      method: "POST",
      url: `/t/${HEX}`,
      headers: { "content-type": "application/json" },
      payload,
    });
    expect(trigger.statusCode).toBe(413);
    expect(parseApiError(trigger.json())).toEqual({ error: "payload_too_large" });
    expect(runRepository.snapshot()).toEqual([]);

    const crud = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: {
        "content-type": "application/json",
        "x-demo-key": DEMO_KEY,
      },
      payload,
    });
    expect(crud.statusCode).toBe(400);
  });

  it("returns 404 for GET /t/:triggerToken", async () => {
    await seed(repository);

    const response = await app.inject({
      method: "GET",
      url: `/t/${HEX}`,
    });

    expect(response.statusCode).toBe(404);
    expect(parseApiError(response.json())).toEqual({ error: "not_found" });
    expect(runRepository.snapshot()).toEqual([]);
  });

  it("keeps GET /workflows/:id/runs unregistered", async () => {
    const workflow = await seed(repository);

    const missingKey = await app.inject({
      method: "GET",
      url: `/workflows/${workflow.id}/runs`,
    });
    expect(missingKey.statusCode).toBe(401);
    expect(parseApiError(missingKey.json())).toEqual({ error: "unauthorized" });

    const withKey = await app.inject({
      method: "GET",
      url: `/workflows/${workflow.id}/runs`,
      headers: { "x-demo-key": DEMO_KEY },
    });
    expect(withKey.statusCode).toBe(404);
    expect(parseApiError(withKey.json())).toEqual({ error: "not_found" });
  });
});

describe("POST /t/:triggerToken allowPrivateUrls", () => {
  it("fails a private URL before fetch when private URLs are disabled", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      return new Response(null, { status: 200 });
    };
    const { app, repository, runRepository } = await startApp({
      allowPrivateUrls: false,
      fetchImpl,
    });
    try {
      const workflow = await seed(repository, { steps: [httpStep] });
      const response = await app.inject({
        method: "POST",
        url: `/t/${HEX}`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body: unknown = response.json();
      const runs = runRepository.snapshot();
      expect(runs).toHaveLength(1);
      const stored = runs[0];
      if (stored === undefined) {
        throw new Error("expected a persisted run");
      }
      expect(body).toEqual({
        status: "failed",
        runId: stored.id,
        workflowId: workflow.id,
        startedAt: stored.startedAt,
        finishedAt: stored.finishedAt,
        error: {
          stepIndex: 0,
          stepType: "http_request",
          message: "blocked URL",
        },
      });
      expect(calls).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("calls fetch for a private URL when private URLs are allowed", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      return new Response(null, { status: 200 });
    };
    const { app, repository, runRepository } = await startApp({
      allowPrivateUrls: true,
      fetchImpl,
    });
    try {
      await seed(repository, { steps: [httpStep] });
      const response = await app.inject({
        method: "POST",
        url: `/t/${HEX}`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(TriggerResponseSchema.parse(response.json()).status).toBe("success");
      expect(calls).toEqual(["http://127.0.0.1/alerts"]);
      expect(runRepository.snapshot()).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});

describe("POST /t/:triggerToken token shape", () => {
  it("returns 400 for a malformed token without looking it up", async () => {
    const { repository, lookups } = repositoryThatRejectsLookup();
    const { app, runRepository } = await startApp({ repository });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/t/NOT-A-TOKEN",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });
      expect(lookups()).toBe(0);
      expect(runRepository.snapshot()).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

describe("unauthenticated runs path", () => {
  it("still requires the demo credential for an unknown workflow id", async () => {
    const { app } = await startApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: `/workflows/${randomUUID()}/runs`,
      });
      expect(response.statusCode).toBe(401);
      expect(parseApiError(response.json())).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });
});
