import { z } from "zod";

import { JsonObjectSchema } from "./json.js";

export const WorkflowRunStatusSchema = z.enum(["success", "skipped", "failed"]);

export const WorkflowStepTypeSchema = z.enum(["transform", "filter", "http_request"]);

export const WorkflowRunErrorSchema = z.strictObject({
  stepIndex: z.int().nonnegative(),
  stepType: WorkflowStepTypeSchema,
  message: z.string().min(1),
  httpStatus: z.int().min(100).max(599).optional(),
});

export const TriggerResponseSchema = z.strictObject({
  status: WorkflowRunStatusSchema,
  runId: z.uuid(),
  workflowId: z.uuid(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  error: WorkflowRunErrorSchema.nullable(),
});

export const WorkflowRunSchema = z.strictObject({
  id: z.uuid(),
  workflowId: z.uuid(),
  status: WorkflowRunStatusSchema,
  error: WorkflowRunErrorSchema.nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  requestBody: JsonObjectSchema,
  finalCtx: JsonObjectSchema,
});

export const TriggerBodySchema = JsonObjectSchema;

export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;
export type WorkflowStepType = z.infer<typeof WorkflowStepTypeSchema>;
export type WorkflowRunError = z.infer<typeof WorkflowRunErrorSchema>;
export type TriggerResponse = z.infer<typeof TriggerResponseSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type TriggerBody = z.infer<typeof TriggerBodySchema>;
