import { randomUUID } from "node:crypto";

import {
  ApiErrorSchema,
  TriggerTokenSchema,
  WorkflowSchema,
} from "@kisi-workflow/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { InMemoryWorkflowRepository } from "../db/in-memory-workflow-repository.js";
import type { WorkflowRepository } from "../db/workflow-repository.js";

const DEMO_KEY = "test-demo-key";
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
  repository?: WorkflowRepository;
}): Promise<{ app: FastifyInstance; repository: WorkflowRepository }> {
  const repository = options?.repository ?? new InMemoryWorkflowRepository();
  const app = await buildApp({
    repository,
    config: {
      publicUrl: PUBLIC_URL,
      demoAccessKey: options?.demoAccessKey ?? DEMO_KEY,
      bodyLimitBytes: options?.bodyLimitBytes ?? 256 * 1024,
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
    const parsed = WorkflowSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.name).toBe("Unlock alerts");
    expect(parsed.data.enabled).toBe(true);
    expect(parsed.data.steps).toEqual([]);
    expect(TriggerTokenSchema.safeParse(parsed.data.triggerToken).success).toBe(true);
    expect(parsed.data.triggerPath).toBe(`/t/${parsed.data.triggerToken}`);
    expect(parsed.data.triggerUrl).toBe(`${PUBLIC_URL}/t/${parsed.data.triggerToken}`);
  });

  it("lists created workflows", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: "/workflows",
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const list = response.json();
    expect(Array.isArray(list)).toBe(true);
    const parsed = WorkflowSchema.array().safeParse(list);
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
    const createdBody = WorkflowSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(WorkflowSchema.parse(response.json()).id).toBe(createdBody.id);
  });

  it("patches a subset of workflow fields", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowSchema.parse(created.json());

    const response = await app.inject({
      method: "PATCH",
      url: `/workflows/${createdBody.id}`,
      headers: authHeaders(),
      payload: { enabled: false, name: "Renamed" },
    });

    expect(response.statusCode).toBe(200);
    const patched = WorkflowSchema.parse(response.json());
    expect(patched.name).toBe("Renamed");
    expect(patched.enabled).toBe(false);
    expect(patched.steps).toEqual([]);
    expect(patched.triggerToken).toBe(createdBody.triggerToken);
  });

  it("puts a full workflow replacement without changing the token", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowSchema.parse(created.json());

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
    const replaced = WorkflowSchema.parse(response.json());
    expect(replaced.name).toBe("Replaced");
    expect(replaced.enabled).toBe(false);
    expect(replaced.steps).toHaveLength(1);
    expect(replaced.triggerToken).toBe(createdBody.triggerToken);
    expect(replaced.triggerPath).toBe(createdBody.triggerPath);
  });

  it("deletes a workflow and then returns not_found", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: createBody,
    });
    const createdBody = WorkflowSchema.parse(created.json());

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
    const createdBody = WorkflowSchema.parse(created.json());

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
    const createdBody = WorkflowSchema.parse(created.json());

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
    expect(WorkflowSchema.parse(unchanged.json()).triggerToken).toBe(createdBody.triggerToken);
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
    const createdBody = WorkflowSchema.parse(created.json());

    const response = await app.inject({
      method: "GET",
      url: `/workflows/${createdBody.id}/runs`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(parseApiError(response.json())).toMatchObject({ error: "not_found" });
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
      expect(WorkflowSchema.parse(first.json()).triggerToken).toBe(HEX_A);

      const second = await app.inject({
        method: "POST",
        url: "/workflows",
        headers: authHeaders(),
        payload: { name: "Second", steps: [] },
      });
      expect(second.statusCode).toBe(201);
      expect(WorkflowSchema.parse(second.json()).triggerToken).toBe(HEX_B);
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
