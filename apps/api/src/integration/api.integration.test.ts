import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import {
  ApiErrorSchema,
  TriggerResponseSchema,
  WorkflowRunSchema,
  WorkflowSchema,
  type Workflow,
  type WorkflowRun,
} from "@kisi-workflow/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { CRUD_BODY_LIMIT_BYTES } from "../config.js";
import { UniqueTriggerTokenError } from "../db/errors.js";
import { PrismaWorkflowRepository } from "../db/prisma-workflow-repository.js";
import { PrismaWorkflowRunRepository } from "../db/prisma-workflow-run-repository.js";
import type { DnsResolver } from "../security/ssrf.js";
import { triggerPathFor } from "../workflows/trigger-token.js";

const execFileAsync = promisify(execFile);

const TEST_DATABASE_URL = "postgresql://kisi:kisi@localhost:5432/workflow_engine_test";
const DEMO_KEY = "test-demo-key";
const PUBLIC_URL = "https://api.example.com";
const PUBLIC_IP = "93.184.216.34";
const ALERT_URL = "https://example.com/alerts";
const DUPLICATE_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const UNKNOWN_TOKEN = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const apiRoot = path.resolve(import.meta.dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");

const filterStep = {
  type: "filter" as const,
  conditions: [{ path: "type", op: "eq" as const, value: "lock.unlock" }],
};

const replacementStep = {
  type: "filter" as const,
  conditions: [{ path: "type", op: "neq" as const, value: "ignored" }],
};

const requestBody = { type: "lock.unlock" };

let prisma: PrismaClient;
let app: FastifyInstance | undefined;

function authHeaders(): { "x-demo-key": string } {
  return { "x-demo-key": DEMO_KEY };
}

async function ensureTestDatabase(): Promise<void> {
  const existing = await execFileAsync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "kisi",
      "-d",
      "postgres",
      "-tAc",
      "SELECT 1 FROM pg_database WHERE datname = 'workflow_engine_test'",
    ],
    { cwd: repoRoot },
  );
  if (existing.stdout.trim() === "1") {
    return;
  }
  await execFileAsync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "kisi",
      "-d",
      "postgres",
      "-c",
      "CREATE DATABASE workflow_engine_test",
    ],
    { cwd: repoRoot },
  );
}

async function migrateTestDatabase(): Promise<void> {
  await execFileAsync(path.join(repoRoot, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
    },
  });
}

async function openApp(options?: {
  fetchImpl?: typeof fetch;
  resolve?: DnsResolver;
}): Promise<FastifyInstance> {
  app = await buildApp({
    repository: new PrismaWorkflowRepository(prisma),
    runRepository: new PrismaWorkflowRunRepository(prisma),
    config: {
      publicUrl: PUBLIC_URL,
      demoAccessKey: DEMO_KEY,
      bodyLimitBytes: CRUD_BODY_LIMIT_BYTES,
      allowPrivateUrls: false,
    },
    fetchImpl: options?.fetchImpl,
    resolve: options?.resolve,
    logger: false,
  });
  return app;
}

function httpDouble(status: number, body = ""): {
  fetchImpl: typeof fetch;
  resolve: DnsResolver;
  urls: () => readonly string[];
  hosts: () => readonly string[];
} {
  const urls: string[] = [];
  const hosts: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(body, { status });
  };
  const resolve: DnsResolver = async (hostname) => {
    hosts.push(hostname);
    return [{ address: PUBLIC_IP, family: 4 }];
  };
  return {
    fetchImpl,
    resolve,
    urls: () => urls,
    hosts: () => hosts,
  };
}

function unreachableHttp(): { fetchImpl: typeof fetch; resolve: DnsResolver } {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("fetch should not be called");
  };
  const resolve: DnsResolver = async () => {
    throw new Error("DNS resolver should not be called");
  };
  return { fetchImpl, resolve };
}

async function createWorkflow(
  current: FastifyInstance,
  payload: { name: string; enabled?: boolean; steps: unknown[] },
): Promise<Workflow> {
  const response = await current.inject({
    method: "POST",
    url: "/workflows",
    headers: authHeaders(),
    payload,
  });
  expect(response.statusCode).toBe(201);
  return WorkflowSchema.parse(response.json());
}

async function persistedRun(id: string): Promise<WorkflowRun> {
  const row = await prisma.workflowRun.findUnique({ where: { id } });
  if (!row) {
    throw new Error(`missing run ${id}`);
  }
  return WorkflowRunSchema.parse({
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    requestBody: row.requestBody,
    finalCtx: row.finalCtx,
  });
}

describe("PostgreSQL API integration", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
    await migrateTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "workflows" CASCADE`;
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("round-trips workflow JSONB through create, list, get, patch, replace, and delete", async () => {
    const current = await openApp();
    const created = await createWorkflow(current, {
      name: "Unlock alerts",
      steps: [filterStep],
    });

    const createdRow = await prisma.workflow.findUnique({ where: { id: created.id } });
    if (!createdRow) {
      throw new Error("missing created workflow");
    }
    expect(createdRow.steps).toEqual([filterStep]);
    expect(created.steps).toEqual([filterStep]);

    const list = await current.inject({
      method: "GET",
      url: "/workflows",
      headers: authHeaders(),
    });
    expect(list.statusCode).toBe(200);
    expect(WorkflowSchema.array().parse(list.json())).toEqual([
      expect.objectContaining({ id: created.id, steps: [filterStep] }),
    ]);

    const fetched = await current.inject({
      method: "GET",
      url: `/workflows/${created.id}`,
      headers: authHeaders(),
    });
    expect(fetched.statusCode).toBe(200);
    expect(WorkflowSchema.parse(fetched.json()).steps).toEqual([filterStep]);

    const patched = await current.inject({
      method: "PATCH",
      url: `/workflows/${created.id}`,
      headers: authHeaders(),
      payload: { enabled: false },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = WorkflowSchema.parse(patched.json());
    expect(patchedBody.enabled).toBe(false);
    expect(patchedBody.steps).toEqual([filterStep]);
    const patchedRow = await prisma.workflow.findUnique({ where: { id: created.id } });
    expect(patchedRow?.enabled).toBe(false);
    expect(patchedRow?.steps).toEqual([filterStep]);

    const replaced = await current.inject({
      method: "PUT",
      url: `/workflows/${created.id}`,
      headers: authHeaders(),
      payload: { name: "Renamed alerts", enabled: true, steps: [replacementStep] },
    });
    expect(replaced.statusCode).toBe(200);
    expect(WorkflowSchema.parse(replaced.json()).steps).toEqual([replacementStep]);
    const replacedRow = await prisma.workflow.findUnique({ where: { id: created.id } });
    expect(replacedRow?.name).toBe("Renamed alerts");
    expect(replacedRow?.steps).toEqual([replacementStep]);

    const deleted = await current.inject({
      method: "DELETE",
      url: `/workflows/${created.id}`,
      headers: authHeaders(),
    });
    expect(deleted.statusCode).toBe(204);
    const missing = await current.inject({
      method: "GET",
      url: `/workflows/${created.id}`,
      headers: authHeaders(),
    });
    expect(missing.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(missing.json())).toEqual({ error: "not_found" });
    expect(await prisma.workflow.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("does not insert a workflow when create validation fails", async () => {
    const current = await openApp();
    const response = await current.inject({
      method: "POST",
      url: "/workflows",
      headers: authHeaders(),
      payload: { name: "", steps: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json()).error).toBe("validation_error");
    expect(await prisma.workflow.count()).toBe(0);
  });

  it("does not insert a workflow when the demo credential is missing", async () => {
    const current = await openApp();
    const response = await current.inject({
      method: "POST",
      url: "/workflows",
      payload: { name: "Unlock alerts", steps: [] },
    });

    expect(response.statusCode).toBe(401);
    expect(ApiErrorSchema.parse(response.json())).toEqual({ error: "unauthorized" });
    expect(await prisma.workflow.count()).toBe(0);
  });

  it("persists a successful run with the transformed context", async () => {
    const http = httpDouble(200);
    const current = await openApp(http);
    const workflow = await createWorkflow(current, {
      name: "Unlock alerts",
      steps: [
        {
          type: "transform",
          ops: [{ op: "template", to: "title", template: "Event {{type}}" }],
        },
        {
          type: "http_request",
          method: "POST",
          url: ALERT_URL,
          timeoutMs: 1000,
          retries: 0,
        },
      ],
    });

    const response = await current.inject({
      method: "POST",
      url: `/t/${workflow.triggerToken}`,
      payload: requestBody,
    });

    expect(response.statusCode).toBe(200);
    const body = TriggerResponseSchema.parse(response.json());
    const run = await persistedRun(body.runId);
    expect(run.id).toBe(body.runId);
    expect(run.workflowId).toBe(workflow.id);
    expect(run.status).toBe("success");
    expect(run.requestBody).toEqual(requestBody);
    expect(run.finalCtx).toEqual({ type: "lock.unlock", title: "Event lock.unlock" });
    expect(run.error).toBeNull();
    expect(body).toMatchObject({
      status: "success",
      workflowId: workflow.id,
      error: null,
    });
    expect(http.hosts()).toEqual(["example.com"]);
    expect(http.urls()).toEqual([ALERT_URL]);
  });

  it("persists a skipped run when the filter does not match", async () => {
    const current = await openApp(unreachableHttp());
    const workflow = await createWorkflow(current, {
      name: "Unlock alerts",
      steps: [filterStep],
    });

    const response = await current.inject({
      method: "POST",
      url: `/t/${workflow.triggerToken}`,
      payload: { type: "other" },
    });

    expect(response.statusCode).toBe(200);
    const body = TriggerResponseSchema.parse(response.json());
    const run = await persistedRun(body.runId);
    expect(run.id).toBe(body.runId);
    expect(run.workflowId).toBe(workflow.id);
    expect(run.status).toBe("skipped");
    expect(run.requestBody).toEqual({ type: "other" });
    expect(run.finalCtx).toEqual({ type: "other" });
    expect(run.error).toBeNull();
    expect(body.status).toBe("skipped");
    expect(body.error).toBeNull();
  });

  it("persists a failed run when the HTTP step returns 500", async () => {
    const http = httpDouble(500, "down");
    const current = await openApp(http);
    const workflow = await createWorkflow(current, {
      name: "Unlock alerts",
      steps: [
        {
          type: "http_request",
          method: "POST",
          url: ALERT_URL,
          timeoutMs: 1000,
          retries: 0,
        },
      ],
    });

    const response = await current.inject({
      method: "POST",
      url: `/t/${workflow.triggerToken}`,
      payload: requestBody,
    });

    expect(response.statusCode).toBe(200);
    const body = TriggerResponseSchema.parse(response.json());
    const run = await persistedRun(body.runId);
    const error = {
      stepIndex: 0,
      stepType: "http_request" as const,
      message: "HTTP 500: down",
      httpStatus: 500,
    };
    expect(run.id).toBe(body.runId);
    expect(run.workflowId).toBe(workflow.id);
    expect(run.status).toBe("failed");
    expect(run.requestBody).toEqual(requestBody);
    expect(run.finalCtx).toEqual(requestBody);
    expect(run.error).toEqual(error);
    expect(body.error).toEqual(error);
    expect(http.hosts()).toEqual(["example.com"]);
    expect(http.urls()).toEqual([ALERT_URL]);
  });

  it("returns not_found for an unknown trigger token and stores no run", async () => {
    const current = await openApp(unreachableHttp());
    const response = await current.inject({
      method: "POST",
      url: `/t/${UNKNOWN_TOKEN}`,
      payload: requestBody,
    });

    expect(response.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(response.json())).toEqual({ error: "not_found" });
    expect(await prisma.workflowRun.count()).toBe(0);
  });

  it("returns workflow_disabled for a disabled workflow and stores no run", async () => {
    const current = await openApp(unreachableHttp());
    const workflow = await createWorkflow(current, {
      name: "Unlock alerts",
      enabled: false,
      steps: [],
    });

    const response = await current.inject({
      method: "POST",
      url: `/t/${workflow.triggerToken}`,
      payload: requestBody,
    });

    expect(response.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(response.json())).toEqual({ error: "workflow_disabled" });
    expect(await prisma.workflowRun.count()).toBe(0);
  });

  it("deletes persisted runs when the workflow is deleted", async () => {
    const http = httpDouble(200);
    const current = await openApp(http);
    const workflow = await createWorkflow(current, {
      name: "Unlock alerts",
      steps: [
        {
          type: "http_request",
          method: "POST",
          url: ALERT_URL,
          timeoutMs: 1000,
          retries: 0,
        },
      ],
    });

    const triggered = await current.inject({
      method: "POST",
      url: `/t/${workflow.triggerToken}`,
      payload: requestBody,
    });
    const body = TriggerResponseSchema.parse(triggered.json());
    expect(await prisma.workflowRun.count()).toBe(1);

    const deleted = await current.inject({
      method: "DELETE",
      url: `/workflows/${workflow.id}`,
      headers: authHeaders(),
    });
    expect(deleted.statusCode).toBe(204);
    expect(await prisma.workflow.findUnique({ where: { id: workflow.id } })).toBeNull();
    expect(await prisma.workflowRun.findUnique({ where: { id: body.runId } })).toBeNull();
    expect(await prisma.workflowRun.count()).toBe(0);
  });

  it("rejects a second workflow with the same trigger token", async () => {
    const repository = new PrismaWorkflowRepository(prisma);
    const input = {
      name: "Unlock alerts",
      enabled: true,
      steps: [],
      triggerToken: DUPLICATE_TOKEN,
      triggerPath: triggerPathFor(DUPLICATE_TOKEN),
    };

    await repository.create(input);
    await expect(repository.create({ ...input, name: "Other alerts" })).rejects.toBeInstanceOf(
      UniqueTriggerTokenError,
    );
    expect(await prisma.workflow.count()).toBe(1);
  });
});
