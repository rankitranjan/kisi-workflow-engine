import type { WorkflowRun } from "@kisi-workflow/shared";

import type { NewWorkflowRun, WorkflowRunRepository } from "./workflow-run-repository.js";

export class InMemoryWorkflowRunRepository implements WorkflowRunRepository {
  private readonly runs: WorkflowRun[] = [];

  async create(input: NewWorkflowRun): Promise<WorkflowRun> {
    const run: WorkflowRun = {
      id: input.id,
      workflowId: input.workflowId,
      status: input.status,
      error: input.error === null ? null : structuredClone(input.error),
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      createdAt: new Date().toISOString(),
      requestBody: structuredClone(input.requestBody),
      finalCtx: structuredClone(input.finalCtx),
    };
    this.runs.push(structuredClone(run));
    return structuredClone(run);
  }

  snapshot(): WorkflowRun[] {
    return structuredClone(this.runs);
  }
}
