import { Prisma, type PrismaClient } from "@prisma/client";
import { WorkflowRunSchema } from "@kisi-workflow/shared";
import type { WorkflowRun } from "@kisi-workflow/shared";

import type { NewWorkflowRun, WorkflowRunRepository } from "./workflow-run-repository.js";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  const serialized: unknown = JSON.parse(JSON.stringify(value));
  return serialized as Prisma.InputJsonValue;
}

function toWorkflowRun(row: {
  id: string;
  workflowId: string;
  status: string;
  error: Prisma.JsonValue | null;
  startedAt: Date;
  finishedAt: Date;
  createdAt: Date;
  requestBody: Prisma.JsonValue;
  finalCtx: Prisma.JsonValue;
}): WorkflowRun {
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

export class PrismaWorkflowRunRepository implements WorkflowRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewWorkflowRun): Promise<WorkflowRun> {
    const row = await this.prisma.workflowRun.create({
      data: {
        id: input.id,
        workflowId: input.workflowId,
        status: input.status,
        error: input.error === null ? Prisma.DbNull : toInputJson(input.error),
        startedAt: new Date(input.startedAt),
        finishedAt: new Date(input.finishedAt),
        requestBody: toInputJson(input.requestBody),
        finalCtx: toInputJson(input.finalCtx),
      },
    });
    return toWorkflowRun(row);
  }
}
