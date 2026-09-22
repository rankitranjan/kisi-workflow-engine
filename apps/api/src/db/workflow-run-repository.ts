import type { WorkflowRun } from "@kisi-workflow/shared";

export type NewWorkflowRun = Omit<WorkflowRun, "createdAt">;

export interface WorkflowRunRepository {
  create(input: NewWorkflowRun): Promise<WorkflowRun>;
}
