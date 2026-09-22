import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PrismaWorkflowRunRepository } from "./prisma-workflow-run-repository.js";
import type { NewWorkflowRun } from "./workflow-run-repository.js";

const runId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const startedAt = "2026-09-23T00:00:00.000Z";
const finishedAt = "2026-09-23T00:00:01.000Z";

function baseRun(overrides: Partial<NewWorkflowRun> = {}): NewWorkflowRun {
  return {
    id: runId,
    workflowId,
    status: "success",
    error: null,
    startedAt,
    finishedAt,
    requestBody: { type: "lock.unlock" },
    finalCtx: { type: "lock.unlock", title: "Event" },
    ...overrides,
  };
}

describe("PrismaWorkflowRunRepository", () => {
  it("persists a successful run with a database NULL error", async () => {
    const created: { data?: Record<string, unknown> } = {};
    const prisma = {
      workflowRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return {
            id: runId,
            workflowId,
            status: "success",
            error: null,
            startedAt: new Date(startedAt),
            finishedAt: new Date(finishedAt),
            createdAt: new Date(finishedAt),
            requestBody: { type: "lock.unlock" },
            finalCtx: { type: "lock.unlock", title: "Event" },
          };
        },
      },
    } as unknown as PrismaClient;

    const run = await new PrismaWorkflowRunRepository(prisma).create(baseRun());
    expect(created.data).toMatchObject({
      id: runId,
      workflowId,
      status: "success",
      error: Prisma.DbNull,
      startedAt: new Date(startedAt),
      finishedAt: new Date(finishedAt),
      requestBody: { type: "lock.unlock" },
      finalCtx: { type: "lock.unlock", title: "Event" },
    });
    expect(run).toMatchObject({
      id: runId,
      status: "success",
      error: null,
      createdAt: finishedAt,
      requestBody: { type: "lock.unlock" },
      finalCtx: { type: "lock.unlock", title: "Event" },
    });
  });

  it("persists a failed run error object", async () => {
    const error = {
      stepIndex: 0,
      stepType: "http_request" as const,
      message: "HTTP 500: down",
      httpStatus: 500,
    };
    const created: { data?: { error?: unknown } } = {};
    const prisma = {
      workflowRun: {
        create: async ({ data }: { data: { error?: unknown } }) => {
          created.data = data;
          return {
            id: runId,
            workflowId,
            status: "failed",
            error,
            startedAt: new Date(startedAt),
            finishedAt: new Date(finishedAt),
            createdAt: new Date(finishedAt),
            requestBody: { type: "lock.unlock" },
            finalCtx: { type: "lock.unlock" },
          };
        },
      },
    } as unknown as PrismaClient;

    const run = await new PrismaWorkflowRunRepository(prisma).create(
      baseRun({ status: "failed", error, finalCtx: { type: "lock.unlock" } }),
    );
    expect(created.data?.error).toEqual(error);
    expect(run.error).toEqual(error);
    expect(run.status).toBe("failed");
  });
});
