import type { Workflow, WorkflowPatch, WorkflowPut, WorkflowStep } from "@kisi-workflow/shared";

export type PersistedWorkflow = Omit<Workflow, "triggerUrl">;

export type WorkflowCreateRecord = {
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
  triggerToken: string;
  triggerPath: string;
};

export interface WorkflowRepository {
  list(): Promise<PersistedWorkflow[]>;
  getById(id: string): Promise<PersistedWorkflow | null>;
  create(input: WorkflowCreateRecord): Promise<PersistedWorkflow>;
  update(id: string, patch: WorkflowPatch): Promise<PersistedWorkflow | null>;
  replace(id: string, put: WorkflowPut): Promise<PersistedWorkflow | null>;
  deleteById(id: string): Promise<boolean>;
}
