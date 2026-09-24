import { randomUUID } from "node:crypto";

import {
  ApiErrorSchema,
  WorkflowDetailSchema,
  WorkflowListItemSchema,
} from "@kisi-workflow/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { InMemoryWorkflowRepository } from "../db/in-memory-workflow-repository.js";
import { InMemoryWorkflowRunRepository } from "../db/in-memory-workflow-run-repository.js";
import type { WorkflowRepository } from "../db/workflow-repository.js";

const DEMO_KEY = "test-demo-key";
const DEMO_WEBHOOK_URL = "https://discord.com/api/webhooks/example/example";
const PUBLIC_URL = "https://api.example.com";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const HEX_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEX_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const createBody = {
  name: "Unlock alerts",
  steps: [],
};

function authHeaders(key = DEMO_KEY): { "x-demo-key": string } {
  return { "x-demo-key": key };
}

function parseApiError(body: unknown) {
  const parsed = ApiErrorSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : undefined;
}

function throwingRepository(): WorkflowRepository {
  const fail = async (): Promise<never> => {
    throw new Error("db down");
  };
  return {
    list: fail,
    getById: fail,
    getByTriggerToken: fail,
    create: fail,
    update: fail,
    replace: fail,
    deleteById: fail,
  };
}

async function startApp(options?: {
  generateTriggerToken?: () => string;
  bodyLimitBytes?: number;
  demoAccessKey?: string;
  demoWebhookUrl?: string;
  repository?: WorkflowRepository;
}): Promise<{ app: FastifyInstance; repository: WorkflowRepository }> {
  const repository = options?.repository ?? new InMemoryWorkflowRepository();
  const app = await buildApp({
    repository,
    runRepository: new InMemoryWorkflowRunRepository(),
    config: {
      publicUrl: PUBLIC_URL,
      demoAccessKey: options?.demoAccessKey ?? DEMO_KEY,
      bodyLimitBytes: options?.bodyLimitBytes ?? 256 * 1024,
      allowPrivateUrls: false,
      demoWebhookUrl: options?.demoWebhookUrl,
    },
    generateTriggerToken: options?.generateTriggerToken,
    logger: false,
  });
  return { app, repository };
}

describe("workflow CRUD API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await startApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a workflow with a server-generated token and 201", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });

    expect(response.statusCode).toBe(201);
    const parsed = WorkflowDetailSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.name).toBe("Unlock alerts");
    expect(parsed.data.enabled).toBe(true);
    expect(parsed.data.steps).toEqual([]);
    expect(parsed.data.triggerUrl).toMatch(new RegExp(`^${PUBLIC_URL}/t/[0-9a-f]{32}$`));
  });

  it("lists created workflows", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const list = response.json();
    expect(Array.isArray(list)).toBe(true);
    const parsed = WorkflowListItemSchema.array().safeParse(list);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.some((workflow) => workflow.id === createdBody.id)).toBe(true);
  });

  it("gets a workflow by id", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(WorkflowDetailSchema.parse(response.json()).id).toBe(createdBody.id);
  });

  it("patches a subset of workflow fields", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "PATCH",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: { enabled: false, name: "Renamed" },
    });

    expect(response.statusCode).toBe(200);
    const patched = WorkflowDetailSchema.parse(response.json());
    expect(patched.name).toBe("Renamed");
    expect(patched.enabled).toBe(false);
    expect(patched.steps).toEqual([]);
    expect(patched.triggerUrl).toBe(createdBody.triggerUrl);
  });

  it("puts a full workflow replacement without changing the token", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "PUT",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: {
        name: "Replaced",
        enabled: false,
        steps: [
          {
            type: "filter",
            conditions: [{ path: "success", op: "eq", value: true }],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const replaced = WorkflowDetailSchema.parse(response.json());
    expect(replaced.name).toBe("Replaced");
    expect(replaced.enabled).toBe(false);
    expect(replaced.steps).toHaveLength(1);
    expect(replaced.triggerUrl).toBe(createdBody.triggerUrl);
  });

  it("deletes a workflow and then returns not_found", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const deleted = await app.inject({
      method: "DELETE",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });
    expect(deleted.statusCode).toBe(204);

    const missing = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });
    expect(missing.statusCode).toBe(404);
    expect(parseApiError(missing.json())).toMatchObject({ error: "not_found" });
  });

  it("rejects an empty name as validation_error", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "", steps: [] },
    });

    expect(response.statusCode).toBe(400);
    const error = parseApiError(response.json());
    expect(error).toMatchObject({ error: "validation_error" });
    if (error?.error === "validation_error") {
      expect(error.details.fieldErrors.name?.length).toBeGreaterThan(0);
    }
  });

  it("rejects PUT without enabled because PUT is a full replace", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "PUT",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: { name: "Replaced", steps: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });
  });

  it("returns not_found for an unknown workflow id", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/workflows/${UNKNOWN_ID}`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(parseApiError(response.json())).toMatchObject({ error: "not_found" });
  });

  it("rejects client-supplied triggerToken on create", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { ...createBody, triggerToken: HEX_A },
    });

    expect(response.statusCode).toBe(400);
    expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });
  });

  it("rejects client-supplied triggerToken on patch", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "PATCH",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: { triggerToken: HEX_B },
    });

    expect(response.statusCode).toBe(400);
    expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });

    const unchanged = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });
    expect(WorkflowDetailSchema.parse(unchanged.json()).triggerUrl).toBe(createdBody.triggerUrl);
  });

  it("returns unauthorized when the demo access credential is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows",
    });

    expect(response.statusCode).toBe(401);
    expect(parseApiError(response.json())).toMatchObject({ error: "unauthorized" });
  });

  it("returns unauthorized when the demo access credential is wrong", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: authHeaders("wrong-key"),
    });

    expect(response.statusCode).toBe(401);
    expect(parseApiError(response.json())).toMatchObject({ error: "unauthorized" });
  });

  it("does not expose a public runs collection", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}/runs`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(parseApiError(response.json())).toMatchObject({ error: "not_found" });
  });
});

const secretHttpStep = {
  type: "http_request" as const,
  method: "POST" as const,
  url: DEMO_WEBHOOK_URL,
  headers: { "Content-Type": "application/json" },
  body: { mode: "custom" as const, json: { content: "{{title}}" } },
  timeoutMs: 2000,
  retries: 3,
};

function responseHidesWebhook(body: string): void {
  expect(body).not.toContain(DEMO_WEBHOOK_URL);
}

describe("demo webhook redaction", () => {
  let app: FastifyInstance;
  let repository: WorkflowRepository;

  beforeEach(async () => {
    ({ app, repository } = await startApp({ demoWebhookUrl: DEMO_WEBHOOK_URL }));
  });

  afterEach(async () => {
    await app.close();
  });

  it("omits steps from GET /workflows and hides the webhook URL", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "Demo unlock alert", steps: [secretHttpStep] },
    });
    expect(created.statusCode).toBe(201);
    responseHidesWebhook(created.body);

    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    responseHidesWebhook(response.body);
    const list = WorkflowListItemSchema.array().parse(response.json());
    expect(list).toEqual([
      expect.objectContaining({
        id: WorkflowDetailSchema.parse(created.json()).id,
        name: "Demo unlock alert",
        enabled: true,
      }),
    ]);
    expect(response.body).not.toContain("steps");
  });

  it("returns the redacted marker from GET /workflows/:id and keeps other step fields", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "Demo unlock alert", steps: [secretHttpStep] },
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    responseHidesWebhook(response.body);
    expect(WorkflowDetailSchema.parse(response.json()).steps).toEqual([
      { ...secretHttpStep, url: { redacted: true } },
    ]);
  });

  it("returns a normal http_request URL unchanged", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: {
        name: "Other hook",
        steps: [{ ...secretHttpStep, url: "https://example.com/hook" }],
      },
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });

    expect(WorkflowDetailSchema.parse(response.json()).steps).toEqual([
      { ...secretHttpStep, url: "https://example.com/hook" },
    ]);
  });

  it("restores the configured webhook when PUT sends the redacted marker", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "Demo unlock alert", steps: [secretHttpStep] },
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "PUT",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: {
        name: "Renamed alert",
        enabled: false,
        steps: [
          { type: "filter", conditions: [{ path: "success", op: "eq", value: false }] },
          { ...secretHttpStep, url: { redacted: true } },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    responseHidesWebhook(response.body);
    expect(WorkflowDetailSchema.parse(response.json()).steps).toEqual([
      {
        type: "filter",
        conditions: [{ path: "success", op: "eq", value: false }],
      },
      { ...secretHttpStep, url: { redacted: true } },
    ]);
    const stored = await repository.getById(createdBody.id);
    expect(stored?.steps).toEqual([
      {
        type: "filter",
        conditions: [{ path: "success", op: "eq", value: false }],
      },
      secretHttpStep,
    ]);
  });

  it("stores a normal URL when PUT replaces the redacted webhook", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "Demo unlock alert", steps: [secretHttpStep] },
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());
    const replacement = { ...secretHttpStep, url: "https://example.com/hook" };

    const response = await app.inject({
      method: "PUT",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: { name: "Demo unlock alert", enabled: true, steps: [replacement] },
    });

    expect(response.statusCode).toBe(200);
    expect(WorkflowDetailSchema.parse(response.json()).steps).toEqual([replacement]);
    const stored = await repository.getById(createdBody.id);
    expect(stored?.steps).toEqual([replacement]);
  });

  it("preserves stored steps when PATCH omits them and hides the webhook", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "Demo unlock alert", steps: [secretHttpStep] },
    });
    const createdBody = WorkflowDetailSchema.parse(created.json());

    const response = await app.inject({
      method: "PATCH",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    responseHidesWebhook(response.body);
    expect(WorkflowDetailSchema.parse(response.json())).toMatchObject({
      enabled: false,
      steps: [{ ...secretHttpStep, url: { redacted: true } }],
    });
    const stored = await repository.getById(createdBody.id);
    expect(stored?.steps).toEqual([secretHttpStep]);
    expect(stored?.enabled).toBe(false);
  });

  it("returns 400 when POST contains the redacted marker", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: {
        name: "Demo unlock alert",
        steps: [{ ...secretHttpStep, url: { redacted: true } }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(parseApiError(response.json())).toMatchObject({ error: "validation_error" });
    expect(await repository.list()).toEqual([]);
  });
});

describe("workflow token uniqueness", () => {
  it("retries token generation when the first token already exists", async () => {
    const tokens = [HEX_A, HEX_A, HEX_B];
    let index = 0;
    const { app } = await startApp({
      generateTriggerToken: () => {
        const token = tokens[index] ?? HEX_B;
        index += 1;
        return token;
      },
    });

    try {
      const first = await app.inject({
        method: "POST",
        url: "/workflows",
        headers: authHeaders(),
        payload: { name: "First", steps: [] },
      });
      expect(first.statusCode).toBe(201);
      expect(WorkflowDetailSchema.parse(first.json()).triggerUrl).toBe(`${PUBLIC_URL}/t/${HEX_A}`);

      const second = await app.inject({
        method: "POST",
        url: "/workflows",
        headers: authHeaders(),
        payload: { name: "Second", steps: [] },
      });
      expect(second.statusCode).toBe(201);
      expect(WorkflowDetailSchema.parse(second.json()).triggerUrl).toBe(`${PUBLIC_URL}/t/${HEX_B}`);
    } finally {
      await app.close();
    }
  });
});

describe("workflow API error DTOs", () => {
  it("returns payload_too_large when the CRUD body exceeds the limit", async () => {
    const { app } = await startApp({ bodyLimitBytes: 64 });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/workflows",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        payload: JSON.stringify({
          name: "n".repeat(100),
          steps: [],
        }),
      });

      expect(response.statusCode).toBe(413);
      expect(parseApiError(response.json())).toMatchObject({ error: "payload_too_large" });
    } finally {
      await app.close();
    }
  });

  it("returns internal_error when the repository throws", async () => {
    const { app } = await startApp({ repository: throwingRepository() });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/workflows",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(500);
      expect(parseApiError(response.json())).toMatchObject({ error: "internal_error" });
    } finally {
      await app.close();
    }
  });

  it("returns unauthorized for /workflows* even when the workflow id is unknown", async () => {
    const { app } = await startApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: `/workflows/${randomUUID()}/runs`,
      });
      expect(response.statusCode).toBe(401);
      expect(parseApiError(response.json())).toMatchObject({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });
});
