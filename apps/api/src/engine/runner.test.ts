import { WorkflowRunSchema } from "@kisi-workflow/shared";
import type { WorkflowStep } from "@kisi-workflow/shared";
import { describe, expect, it, vi } from "vitest";

import type { DnsResolver } from "../security/ssrf.js";
import { InMemoryWorkflowRunRepository } from "../db/in-memory-workflow-run-repository.js";

const publicResolve: DnsResolver = async () => [{ address: "8.8.8.8", family: 4 }];
import { EngineValidationError } from "./errors.js";
import { executeWorkflow } from "./runner.js";
import type { ExecuteWorkflowDeps } from "./runner.js";

const WORKFLOW_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const STARTED_AT = "2026-09-23T00:00:00.000Z";
const FINISHED_AT = "2026-09-23T00:00:01.000Z";

function sequentialClock(times: readonly Date[]): () => Date {
  let index = 0;
  return () => {
    const current = times[index];
    if (current === undefined) {
      const last = times[times.length - 1];
      if (last === undefined) {
        throw new Error("clock has no times");
      }
      return last;
    }
    if (index < times.length - 1) {
      index += 1;
    }
    return current;
  };
}

function setup(respond?: () => Promise<Response>): {
  repo: InMemoryWorkflowRunRepository;
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  deps: ExecuteWorkflowDeps;
} {
  const repo = new InMemoryWorkflowRunRepository();
  const fetchMock = vi.fn<typeof fetch>(respond ?? (async () => new Response(null, { status: 200 })));
  const deps: ExecuteWorkflowDeps = {
    runRepository: repo,
    fetchImpl: fetchMock,
    now: sequentialClock([new Date(STARTED_AT), new Date(FINISHED_AT)]),
    sleep: async () => {},
    random: () => 0,
    generateId: () => RUN_ID,
    resolve: publicResolve,
  };
  return { repo, fetchMock, deps };
}

const passingFilter: WorkflowStep = {
  type: "filter",
  conditions: [
    { path: "type", op: "eq", value: "lock.unlock" },
    { path: "success", op: "eq", value: false },
  ],
};

const titleTransform: WorkflowStep = {
  type: "transform",
  ops: [
    { op: "default", path: "actor_name", value: "Unknown" },
    { op: "template", to: "title", template: "Event {{type}} by {{actor_name}}" },
  ],
};

function httpStep(url: string): WorkflowStep {
  return {
    type: "http_request",
    method: "POST",
    url,
    headers: { "X-Workflow-Id": "{{workflow_id}}", "X-Title": "{{title}}" },
    body: { mode: "ctx" },
    timeoutMs: 1000,
    retries: 0,
  };
}

describe("executeWorkflow", () => {
  it("succeeds an empty workflow", async () => {
    const { deps } = setup();
    const run = await executeWorkflow(
      { workflowId: WORKFLOW_ID, steps: [], requestBody: { ok: true } },
      deps,
    );
    expect(run.status).toBe("success");
    expect(run.error).toBeNull();
    expect(run.finalCtx).toEqual({ ok: true });
  });

  it("persists a successful empty workflow", async () => {
    const { deps, repo } = setup();
    const requestBody = { ok: true };
    const run = await executeWorkflow(
      { workflowId: WORKFLOW_ID, steps: [], requestBody },
      deps,
    );

    expect(WorkflowRunSchema.safeParse(run).success).toBe(true);
    expect(run).toMatchObject({
      id: RUN_ID,
      workflowId: WORKFLOW_ID,
      status: "success",
      error: null,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      requestBody,
      finalCtx: requestBody,
    });
    expect(repo.snapshot()).toEqual([run]);
    expect(requestBody).toEqual({ ok: true });
  });

  it("applies a transform step to the execution context", async () => {
    const { deps } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [titleTransform],
        requestBody: { type: "lock.unlock" },
      },
      deps,
    );
    expect(run.status).toBe("success");
    expect(run.finalCtx).toEqual({
      type: "lock.unlock",
      actor_name: "Unknown",
      title: "Event lock.unlock by Unknown",
    });
    expect(run.requestBody).toEqual({ type: "lock.unlock" });
  });

  it("continues when every filter condition matches", async () => {
    const { deps } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [passingFilter, titleTransform],
        requestBody: { type: "lock.unlock", success: false },
      },
      deps,
    );
    expect(run.status).toBe("success");
    expect(run.finalCtx).toMatchObject({ title: "Event lock.unlock by Unknown" });
  });

  it("skips the run when one filter condition fails", async () => {
    const { deps } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [passingFilter],
        requestBody: { type: "lock.unlock", success: true },
      },
      deps,
    );
    expect(run.status).toBe("skipped");
    expect(run.error).toBeNull();
    expect(run.finalCtx).toEqual({ type: "lock.unlock", success: true });
  });

  it("does not execute steps after a failed filter", async () => {
    const { deps, fetchMock } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [passingFilter, httpStep("https://alerts.example.com/hook")],
        requestBody: { type: "lock.unlock", success: true },
      },
      deps,
    );
    expect(run.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops subsequent steps when a step fails", async () => {
    const { deps, fetchMock } = setup(async () => new Response("bad request", { status: 400 }));
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [
          httpStep("https://alerts.example.com/one"),
          httpStep("https://alerts.example.com/two"),
        ],
        requestBody: { type: "lock.unlock" },
      },
      deps,
    );
    expect(run.status).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://alerts.example.com/one");
  });

  it("produces the final context of a successful multi-step workflow", async () => {
    const { deps, fetchMock } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [passingFilter, titleTransform, httpStep("https://alerts.example.com/hook")],
        requestBody: { type: "lock.unlock", success: false },
      },
      deps,
    );

    const finalCtx = {
      type: "lock.unlock",
      success: false,
      actor_name: "Unknown",
      title: "Event lock.unlock by Unknown",
    };
    expect(run.status).toBe("success");
    expect(run.finalCtx).toEqual(finalCtx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "X-Workflow-Id": WORKFLOW_ID,
        "X-Title": "Event lock.unlock by Unknown",
      },
      body: JSON.stringify(finalCtx),
    });
  });

  it("persists an error when execution fails", async () => {
    const { deps, repo } = setup(async () => new Response("bad request", { status: 400 }));
    const requestBody = { type: "lock.unlock" };
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [httpStep("https://alerts.example.com/one")],
        requestBody,
      },
      deps,
    );

    expect(WorkflowRunSchema.safeParse(run).success).toBe(true);
    expect(run.status).toBe("failed");
    expect(run.error).toEqual({
      stepIndex: 0,
      stepType: "http_request",
      message: "HTTP 400: bad request",
      httpStatus: 400,
    });
    expect(run.finalCtx).toEqual(requestBody);
    expect(repo.snapshot()).toEqual([run]);
  });

  it("persists a skipped execution", async () => {
    const { deps, repo } = setup();
    const requestBody = { type: "lock.unlock", success: true };
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [passingFilter, titleTransform],
        requestBody,
      },
      deps,
    );
    expect(run.status).toBe("skipped");
    expect(run.error).toBeNull();
    expect(run.finalCtx).toEqual(requestBody);
    expect(repo.snapshot()[0]).toMatchObject({ status: "skipped", error: null, finalCtx: requestBody });
  });

  it("persists the final context of a successful execution", async () => {
    const { deps, repo } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [titleTransform],
        requestBody: { type: "lock.unlock" },
      },
      deps,
    );
    expect(repo.snapshot()[0]).toMatchObject({
      status: "success",
      error: null,
      requestBody: { type: "lock.unlock" },
      finalCtx: {
        type: "lock.unlock",
        actor_name: "Unknown",
        title: "Event lock.unlock by Unknown",
      },
    });
    expect(run.requestBody).not.toBe(run.finalCtx);
  });

  it("does not persist when the steps are invalid", async () => {
    const { deps, repo } = setup();
    await expect(
      executeWorkflow(
        { workflowId: WORKFLOW_ID, steps: [{ type: "transform", ops: [] }], requestBody: {} },
        deps,
      ),
    ).rejects.toBeInstanceOf(EngineValidationError);
    expect(repo.snapshot()).toEqual([]);
  });

  it("does not persist when the request body is not a JSON object", async () => {
    const { deps, repo } = setup();
    await expect(
      executeWorkflow({ workflowId: WORKFLOW_ID, steps: [], requestBody: ["nope"] }, deps),
    ).rejects.toBeInstanceOf(EngineValidationError);
    expect(repo.snapshot()).toEqual([]);
  });

  it("fails the current step and skips later steps when the workflow deadline is reached", async () => {
    const start = new Date(STARTED_AT);
    const { deps, fetchMock } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [titleTransform, httpStep("https://alerts.example.com/hook")],
        requestBody: { type: "lock.unlock" },
      },
      {
        ...deps,
        now: sequentialClock([start, start, new Date(start.getTime() + 25_000)]),
      },
    );

    expect(run.status).toBe("failed");
    expect(run.error).toEqual({
      stepIndex: 1,
      stepType: "http_request",
      message: "workflow time limit exceeded",
    });
    expect(run.finalCtx).toEqual({
      type: "lock.unlock",
      actor_name: "Unknown",
      title: "Event lock.unlock by Unknown",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks a private outbound URL and persists the failure", async () => {
    const { deps, fetchMock, repo } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [{
          type: "http_request",
          method: "GET",
          url: "http://127.0.0.1:9000/alerts",
          timeoutMs: 1000,
          retries: 3,
        }],
        requestBody: {},
      },
      deps,
    );
    expect(run.status).toBe("failed");
    expect(run.error).toMatchObject({ stepIndex: 0, stepType: "http_request", message: "blocked URL" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repo.snapshot()).toHaveLength(1);
  });

  it("calls fetch for a private URL when private hosts are allowed", async () => {
    const { deps, fetchMock } = setup();
    const run = await executeWorkflow(
      {
        workflowId: WORKFLOW_ID,
        steps: [{
          type: "http_request",
          method: "GET",
          url: "http://127.0.0.1:9000/alerts",
          timeoutMs: 1000,
          retries: 0,
        }],
        requestBody: {},
      },
      { ...deps, allowPrivateUrls: true },
    );
    expect(run.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
