import { z } from "zod";

export const ZodFlattenedIssuesSchema = z.strictObject({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.string(), z.array(z.string())),
});

export const ValidationErrorSchema = z.strictObject({
  error: z.literal("validation_error"),
  details: ZodFlattenedIssuesSchema,
});

export const UnauthorizedErrorSchema = z.strictObject({
  error: z.literal("unauthorized"),
});

export const WorkflowDisabledErrorSchema = z.strictObject({
  error: z.literal("workflow_disabled"),
});

export const NotFoundErrorSchema = z.strictObject({
  error: z.literal("not_found"),
});

export const PayloadTooLargeErrorSchema = z.strictObject({
  error: z.literal("payload_too_large"),
});

export const InternalErrorSchema = z.strictObject({
  error: z.literal("internal_error"),
});

export const ApiErrorSchema = z.discriminatedUnion("error", [
  ValidationErrorSchema,
  UnauthorizedErrorSchema,
  WorkflowDisabledErrorSchema,
  NotFoundErrorSchema,
  PayloadTooLargeErrorSchema,
  InternalErrorSchema,
]);

export type ZodFlattenedIssues = z.infer<typeof ZodFlattenedIssuesSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type UnauthorizedError = z.infer<typeof UnauthorizedErrorSchema>;
export type WorkflowDisabledError = z.infer<typeof WorkflowDisabledErrorSchema>;
export type NotFoundError = z.infer<typeof NotFoundErrorSchema>;
export type PayloadTooLargeError = z.infer<typeof PayloadTooLargeErrorSchema>;
export type InternalError = z.infer<typeof InternalErrorSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
