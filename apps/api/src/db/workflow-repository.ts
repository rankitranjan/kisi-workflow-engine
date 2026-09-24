import type { Workflow, WorkflowStep } from "@kisi-workflow/shared";

export type PersistedWorkflow = Omit<Workflow, "triggerUrl">;

export type WorkflowCreateRecord = {
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
  triggerToken: string;
  triggerPath: string;
};

export type WorkflowUpdateRecord = {
  name?: string;
  enabled?: boolean;
  steps?: WorkflowStep[];
};

export type WorkflowReplaceRecord = {
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
};

export interface WorkflowRepository {
  list(): Promise<PersistedWorkflow[]>;
  getById(id: string): Promise<PersistedWorkflow | null>;
  getByTriggerToken(triggerToken: string): Promise<PersistedWorkflow | null>;
  create(input: WorkflowCreateRecord): Promise<PersistedWorkflow>;
  update(id: string, patch: WorkflowUpdateRecord): Promise<PersistedWorkflow | null>;
  replace(id: string, put: WorkflowReplaceRecord): Promise<PersistedWorkflow | null>;
  deleteById(id: string): Promise<boolean>;
}
