import { randomUUID } from "node:crypto";

import { JsonObjectSchema, WorkflowStepsSchema } from "@kisi-workflow/shared";
import type { JsonObject, WorkflowRun, WorkflowRunError, WorkflowStepType } from "@kisi-workflow/shared";

import type { WorkflowRunRepository } from "../db/workflow-run-repository.js";
import type { DnsResolver } from "../security/ssrf.js";
import { EngineValidationError, StepFailedError } from "./errors.js";
import { filterMatches } from "./filter.js";
import { executeHttpRequest } from "./http-request.js";
import type { TemplateBindings } from "./template.js";
import { applyTransform } from "./transform.js";

export const WORKFLOW_DEADLINE_MS = 25_000;

export type ExecuteWorkflowInput = {
  workflowId: string;
  steps: unknown;
  requestBody: unknown;
};

export type ExecuteWorkflowDeps = {
  runRepository: WorkflowRunRepository;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  allowPrivateUrls?: boolean;
  generateId?: () => string;
  deadlineMs?: number;
  resolve?: DnsResolver;
};

function assertNever(value: never): never {
  throw new Error(`unexpected step: ${JSON.stringify(value)}`);
}

function failureOf(error: unknown, stepType: WorkflowStepType): Omit<WorkflowRunError, "stepIndex"> {
  if (error instanceof StepFailedError) {
    const message = error.message.length > 0 ? error.message : "step failed";
    if (error.httpStatus === undefined) {
      return { stepType: error.stepType, message };
    }
    return { stepType: error.stepType, message, httpStatus: error.httpStatus };
  }
  const message = error instanceof Error && error.message.length > 0 ? error.message : "step failed";
  return { stepType, message };
}

export async function executeWorkflow(
  input: ExecuteWorkflowInput,
  deps: ExecuteWorkflowDeps,
): Promise<WorkflowRun> {
  const stepsResult = WorkflowStepsSchema.safeParse(input.steps);
  const bodyResult = JsonObjectSchema.safeParse(input.requestBody);
  if (!stepsResult.success || !bodyResult.success) {
    throw new EngineValidationError();
  }

  const now = deps.now ?? (() => new Date());
  const started = now();
  const deadlineMs = deps.deadlineMs ?? WORKFLOW_DEADLINE_MS;
  const deadlineAt = started.getTime() + deadlineMs;
  const runId = deps.generateId?.() ?? randomUUID();
  const bindings: TemplateBindings = {
    workflow_id: input.workflowId,
    run_id: runId,
  };
  const requestBody = bodyResult.data;
  let ctx: JsonObject = structuredClone(requestBody);

  const finish = async (
    status: WorkflowRun["status"],
    error: WorkflowRunError | null,
    finalCtx: JsonObject,
  ): Promise<WorkflowRun> => {
    return deps.runRepository.create({
      id: runId,
      workflowId: input.workflowId,
      status,
      error,
      startedAt: started.toISOString(),
      finishedAt: now().toISOString(),
      requestBody: structuredClone(requestBody),
      finalCtx: structuredClone(finalCtx),
    });
  };

  for (const [index, step] of stepsResult.data.entries()) {
    if (now().getTime() >= deadlineAt) {
      return finish("failed", {
        stepIndex: index,
        stepType: step.type,
        message: "workflow time limit exceeded",
      }, ctx);
    }

    try {
      if (step.type === "transform") {
        ctx = applyTransform(step, ctx, bindings);
      } else if (step.type === "filter") {
        if (!filterMatches(step, ctx)) {
          return finish("skipped", null, ctx);
        }
      } else if (step.type === "http_request") {
        await executeHttpRequest(step, ctx, {
          fetchImpl: deps.fetchImpl ?? fetch,
          sleep: deps.sleep,
          random: deps.random,
          allowPrivateUrls: deps.allowPrivateUrls,
          bindings,
          now,
          deadlineAt,
          resolve: deps.resolve,
        });
      } else {
        assertNever(step);
      }
    } catch (error) {
      const failure = failureOf(error, step.type);
      return finish("failed", { stepIndex: index, ...failure }, ctx);
    }
  }

  return finish("success", null, ctx);
}
