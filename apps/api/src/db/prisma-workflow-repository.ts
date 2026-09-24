import { Prisma, PrismaClient } from "@prisma/client";
import { WorkflowStepsSchema } from "@kisi-workflow/shared";
import { UniqueTriggerTokenError } from "./errors.js";
import type {
  PersistedWorkflow,
  WorkflowCreateRecord,
  WorkflowReplaceRecord,
  WorkflowRepository,
  WorkflowUpdateRecord,
} from "./workflow-repository.js";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  const serialized: unknown = JSON.parse(JSON.stringify(value));
  return serialized as Prisma.InputJsonValue;
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toPersisted(row: {
  id: string;
  name: string;
  enabled: boolean;
  triggerToken: string;
  triggerPath: string;
  steps: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): PersistedWorkflow {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    triggerToken: row.triggerToken,
    triggerPath: row.triggerPath,
    steps: WorkflowStepsSchema.parse(row.steps),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<PersistedWorkflow[]> {
    const rows = await this.prisma.workflow.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toPersisted);
  }

  async getById(id: string): Promise<PersistedWorkflow | null> {
    const row = await this.prisma.workflow.findUnique({ where: { id } });
    return row ? toPersisted(row) : null;
  }

  async getByTriggerToken(triggerToken: string): Promise<PersistedWorkflow | null> {
    const row = await this.prisma.workflow.findUnique({ where: { triggerToken } });
    return row ? toPersisted(row) : null;
  }

  async create(input: WorkflowCreateRecord): Promise<PersistedWorkflow> {
    try {
      const row = await this.prisma.workflow.create({
        data: {
          name: input.name,
          enabled: input.enabled,
          triggerToken: input.triggerToken,
          triggerPath: input.triggerPath,
          steps: toInputJson(input.steps),
        },
      });
      return toPersisted(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new UniqueTriggerTokenError();
      }
      throw error;
    }
  }

  async update(id: string, patch: WorkflowUpdateRecord): Promise<PersistedWorkflow | null> {
    try {
      const row = await this.prisma.workflow.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.steps !== undefined ? { steps: toInputJson(patch.steps) } : {}),
        },
      });
      return toPersisted(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async replace(id: string, put: WorkflowReplaceRecord): Promise<PersistedWorkflow | null> {
    try {
      const row = await this.prisma.workflow.update({
        where: { id },
        data: {
          name: put.name,
          enabled: put.enabled,
          steps: toInputJson(put.steps),
        },
      });
      return toPersisted(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      await this.prisma.workflow.delete({ where: { id } });
      return true;
    } catch (error) {
      if (isRecordNotFound(error)) {
        return false;
      }
      throw error;
    }
  }
}
