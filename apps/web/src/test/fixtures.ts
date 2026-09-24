import {
  WorkflowDetailSchema,
  WorkflowListItemSchema,
  WorkflowSchema,
  type Workflow,
  type WorkflowDetail,
  type WorkflowListItem,
} from "@kisi-workflow/shared";

const token = "4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e";

export function sampleWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return WorkflowSchema.parse({
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Unlock alerts",
    enabled: true,
    triggerToken: token,
    triggerPath: `/t/${token}`,
    triggerUrl: `https://example.com/t/${token}`,
    steps: [],
    createdAt: "2026-09-22T07:12:00.000Z",
    updatedAt: "2026-09-22T07:12:00.000Z",
    ...overrides,
  });
}

export function sampleWorkflowDetail(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
  const workflow = sampleWorkflow();
  return WorkflowDetailSchema.parse({
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    triggerUrl: workflow.triggerUrl,
    steps: workflow.steps,
    ...overrides,
  });
}

export function sampleWorkflowListItem(overrides: Partial<WorkflowListItem> = {}): WorkflowListItem {
  const workflow = sampleWorkflow();
  return WorkflowListItemSchema.parse({
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    triggerUrl: workflow.triggerUrl,
    ...overrides,
  });
}
