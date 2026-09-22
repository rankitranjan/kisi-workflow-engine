import type { Workflow, WorkflowCreate, WorkflowPatch, WorkflowPut } from "@kisi-workflow/shared";

import { UniqueTriggerTokenError } from "../db/errors.js";
import type { PersistedWorkflow, WorkflowRepository } from "../db/workflow-repository.js";
import { generateTriggerToken, triggerPathFor, triggerUrlFor } from "./trigger-token.js";

const MAX_TOKEN_ATTEMPTS = 8;

export class WorkflowNotFoundError extends Error {
  constructor() {
    super("workflow not found");
    this.name = "WorkflowNotFoundError";
  }
}

export class TriggerTokenAllocationError extends Error {
  constructor() {
    super("failed to allocate a unique trigger token");
    this.name = "TriggerTokenAllocationError";
  }
}

export class WorkflowService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly publicUrl: string,
    private readonly generateToken: () => string = generateTriggerToken,
  ) {}

  async list(): Promise<Workflow[]> {
    const rows = await this.repository.list();
    return rows.map((row) => this.toDto(row));
  }

  async getById(id: string): Promise<Workflow> {
    const row = await this.repository.getById(id);
    if (!row) {
      throw new WorkflowNotFoundError();
    }
    return this.toDto(row);
  }

  async create(input: WorkflowCreate): Promise<Workflow> {
    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
      const triggerToken = this.generateToken();
      try {
        const row = await this.repository.create({
          name: input.name,
          enabled: input.enabled,
          steps: input.steps,
          triggerToken,
          triggerPath: triggerPathFor(triggerToken),
        });
        return this.toDto(row);
      } catch (error) {
        if (error instanceof UniqueTriggerTokenError) {
          continue;
        }
        throw error;
      }
    }

    throw new TriggerTokenAllocationError();
  }

  async patch(id: string, input: WorkflowPatch): Promise<Workflow> {
    const row = await this.repository.update(id, input);
    if (!row) {
      throw new WorkflowNotFoundError();
    }
    return this.toDto(row);
  }

  async put(id: string, input: WorkflowPut): Promise<Workflow> {
    const row = await this.repository.replace(id, input);
    if (!row) {
      throw new WorkflowNotFoundError();
    }
    return this.toDto(row);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.deleteById(id);
    if (!deleted) {
      throw new WorkflowNotFoundError();
    }
  }

  private toDto(row: PersistedWorkflow): Workflow {
    return {
      ...row,
      triggerUrl: triggerUrlFor(this.publicUrl, row.triggerPath),
    };
  }
}
