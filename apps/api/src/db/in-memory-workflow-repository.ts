import { randomUUID } from "node:crypto";

import type { WorkflowPatch, WorkflowPut } from "@kisi-workflow/shared";

import { UniqueTriggerTokenError } from "./errors.js";
import type {
  PersistedWorkflow,
  WorkflowCreateRecord,
  WorkflowRepository,
} from "./workflow-repository.js";

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflows = new Map<string, PersistedWorkflow>();

  async list(): Promise<PersistedWorkflow[]> {
    return [...this.workflows.values()].sort((left, right) =>
      left.createdAt < right.createdAt ? 1 : -1,
    );
  }

  async getById(id: string): Promise<PersistedWorkflow | null> {
    return this.workflows.get(id) ?? null;
  }

  async getByTriggerToken(triggerToken: string): Promise<PersistedWorkflow | null> {
    for (const workflow of this.workflows.values()) {
      if (workflow.triggerToken === triggerToken) {
        return workflow;
      }
    }
    return null;
  }

  async create(input: WorkflowCreateRecord): Promise<PersistedWorkflow> {
    for (const existing of this.workflows.values()) {
      if (
        existing.triggerToken === input.triggerToken ||
        existing.triggerPath === input.triggerPath
      ) {
        throw new UniqueTriggerTokenError();
      }
    }

    const now = new Date().toISOString();
    const record: PersistedWorkflow = {
      id: randomUUID(),
      name: input.name,
      enabled: input.enabled,
      triggerToken: input.triggerToken,
      triggerPath: input.triggerPath,
      steps: input.steps,
      createdAt: now,
      updatedAt: now,
    };
    this.workflows.set(record.id, record);
    return record;
  }

  async update(id: string, patch: WorkflowPatch): Promise<PersistedWorkflow | null> {
    const existing = this.workflows.get(id);
    if (!existing) {
      return null;
    }

    const updated: PersistedWorkflow = {
      ...existing,
      name: patch.name ?? existing.name,
      enabled: patch.enabled ?? existing.enabled,
      steps: patch.steps ?? existing.steps,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async replace(id: string, put: WorkflowPut): Promise<PersistedWorkflow | null> {
    const existing = this.workflows.get(id);
    if (!existing) {
      return null;
    }

    const updated: PersistedWorkflow = {
      ...existing,
      name: put.name,
      enabled: put.enabled,
      steps: put.steps,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.workflows.delete(id);
  }
}
