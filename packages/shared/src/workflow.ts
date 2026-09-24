import { z } from "zod";

import {
  FilterStepSchema,
  HttpOrHttpsUrlSchema,
  HttpRequestStepSchema,
  TransformStepSchema,
  WorkflowStepsSchema,
} from "./steps.js";

export const WORKFLOW_NAME_MAX = 100;
export const TRIGGER_TOKEN_LENGTH = 32;

export const WorkflowNameSchema = z.string().trim().min(1).max(WORKFLOW_NAME_MAX);

export const TriggerTokenSchema = z
  .string()
  .length(TRIGGER_TOKEN_LENGTH)
  .regex(/^[0-9a-f]+$/, "must be lowercase hex");

export const WorkflowCreateSchema = z.strictObject({
  name: WorkflowNameSchema,
  enabled: z.boolean().default(true),
  steps: WorkflowStepsSchema,
});

export const RedactedWebhookUrlSchema = z.strictObject({
  redacted: z.literal(true),
});

export const PublicHttpRequestUrlSchema = z.union([
  HttpOrHttpsUrlSchema,
  RedactedWebhookUrlSchema,
]);

export const PublicHttpRequestStepSchema = HttpRequestStepSchema.omit({ url: true }).extend({
  url: PublicHttpRequestUrlSchema,
});

export const PublicWorkflowStepSchema = z.discriminatedUnion("type", [
  TransformStepSchema,
  FilterStepSchema,
  PublicHttpRequestStepSchema,
]);

export const PublicWorkflowStepsSchema = z.array(PublicWorkflowStepSchema);

export const WorkflowPatchSchema = z.strictObject({
  name: WorkflowNameSchema.optional(),
  enabled: z.boolean().optional(),
  steps: PublicWorkflowStepsSchema.optional(),
});

export const WorkflowPutSchema = z.strictObject({
  name: WorkflowNameSchema,
  enabled: z.boolean(),
  steps: PublicWorkflowStepsSchema,
});

export const WorkflowListItemSchema = z.strictObject({
  id: z.uuid(),
  name: WorkflowNameSchema,
  enabled: z.boolean(),
  triggerUrl: z.httpUrl(),
});

export const WorkflowDetailSchema = z.strictObject({
  id: z.uuid(),
  name: WorkflowNameSchema,
  enabled: z.boolean(),
  triggerUrl: z.httpUrl(),
  steps: PublicWorkflowStepsSchema,
});

export const WorkflowSchema = z
  .strictObject({
    id: z.uuid(),
    name: WorkflowNameSchema,
    enabled: z.boolean(),
    triggerToken: TriggerTokenSchema,
    triggerPath: z.string().regex(/^\/t\/[0-9a-f]{32}$/),
    triggerUrl: z.httpUrl(),
    steps: WorkflowStepsSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((workflow, ctx) => {
    const expectedPath = `/t/${workflow.triggerToken}`;
    if (workflow.triggerPath !== expectedPath) {
      ctx.addIssue({
        code: "custom",
        path: ["triggerPath"],
        message: "must equal /t/<triggerToken>",
        input: workflow.triggerPath,
      });
    }
  });

export type WorkflowCreate = z.infer<typeof WorkflowCreateSchema>;
export type WorkflowPatch = z.infer<typeof WorkflowPatchSchema>;
export type WorkflowPut = z.infer<typeof WorkflowPutSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowListItem = z.infer<typeof WorkflowListItemSchema>;
export type WorkflowDetail = z.infer<typeof WorkflowDetailSchema>;
export type PublicWorkflowStep = z.infer<typeof PublicWorkflowStepSchema>;
