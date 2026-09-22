import { describe, expect, it } from "vitest";

import {
  TriggerBodySchema,
  TriggerResponseSchema,
  WorkflowRunErrorSchema,
  WorkflowRunSchema,
  WorkflowRunStatusSchema,
} from "./run.js";

function issuePaths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): PropertyKey[][] {
  if (result.success || !result.error) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path);
}

const runId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const startedAt = "2026-09-22T07:12:00.000Z";
const finishedAt = "2026-09-22T07:12:01.000Z";

const failedError = {
  stepIndex: 2,
  stepType: "http_request",
  message: "HTTP 500",
  httpStatus: 500,
};

describe("WorkflowRunStatusSchema", () => {
  it("accepts success, skipped, and failed", () => {
    expect(WorkflowRunStatusSchema.safeParse("success").success).toBe(true);
    expect(WorkflowRunStatusSchema.safeParse("skipped").success).toBe(true);
    expect(WorkflowRunStatusSchema.safeParse("failed").success).toBe(true);
  });

  it("rejects running because runs are inserted only when finished", () => {
    const result = WorkflowRunStatusSchema.safeParse("running");
    expect(result.success).toBe(false);
  });
});

describe("WorkflowRunErrorSchema", () => {
  it("accepts an error with optional httpStatus", () => {
    expect(WorkflowRunErrorSchema.safeParse(failedError).success).toBe(true);
    expect(
      WorkflowRunErrorSchema.safeParse({
        stepIndex: 0,
        stepType: "transform",
        message: "unknown op",
      }).success,
    ).toBe(true);
  });

  it("rejects a negative stepIndex", () => {
    const result = WorkflowRunErrorSchema.safeParse({
      ...failedError,
      stepIndex: -1,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["stepIndex"]);
  });
});

describe("TriggerResponseSchema", () => {
  it("accepts a successful trigger body with error null", () => {
    const result = TriggerResponseSchema.safeParse({
      status: "success",
      runId,
      workflowId,
      startedAt,
      finishedAt,
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts skipped with error null", () => {
    const result = TriggerResponseSchema.safeParse({
      status: "skipped",
      runId,
      workflowId,
      startedAt,
      finishedAt,
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts failed with an error object", () => {
    const result = TriggerResponseSchema.safeParse({
      status: "failed",
      runId,
      workflowId,
      startedAt,
      finishedAt,
      error: failedError,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing runId", () => {
    const result = TriggerResponseSchema.safeParse({
      status: "success",
      workflowId,
      startedAt,
      finishedAt,
      error: null,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["runId"]);
  });
});

describe("WorkflowRunSchema", () => {
  it("accepts the persistence shape including requestBody and finalCtx", () => {
    const result = WorkflowRunSchema.safeParse({
      id: runId,
      workflowId,
      status: "success",
      error: null,
      startedAt,
      finishedAt,
      createdAt: finishedAt,
      requestBody: { type: "lock.unlock" },
      finalCtx: { type: "lock.unlock", title: "Event" },
    });
    expect(result.success).toBe(true);
  });
});

describe("TriggerBodySchema", () => {
  it("accepts a JSON object as ctx", () => {
    const result = TriggerBodySchema.safeParse({ type: "lock.unlock", success: false });
    expect(result.success).toBe(true);
  });

  it("rejects an array body", () => {
    const result = TriggerBodySchema.safeParse([{ type: "lock.unlock" }]);
    expect(result.success).toBe(false);
  });

  it("rejects a primitive body", () => {
    expect(TriggerBodySchema.safeParse("unlock").success).toBe(false);
    expect(TriggerBodySchema.safeParse(1).success).toBe(false);
  });
});
