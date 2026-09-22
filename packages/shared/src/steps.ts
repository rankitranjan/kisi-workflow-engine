import { z } from "zod";

import { JsonObjectSchema } from "./json.js";

export const HTTP_TIMEOUT_MS_MIN = 1;
export const HTTP_TIMEOUT_MS_MAX = 10_000;
export const HTTP_TIMEOUT_MS_DEFAULT = 2_000;
export const HTTP_RETRIES_MIN = 0;
export const HTTP_RETRIES_MAX = 5;
export const HTTP_RETRIES_DEFAULT = 3;

export const DotPathSchema = z.string().min(1);

export const DefaultOpSchema = z.strictObject({
  op: z.literal("default"),
  path: DotPathSchema,
  value: z.json(),
});

export const TemplateOpSchema = z.strictObject({
  op: z.literal("template"),
  to: DotPathSchema,
  template: z.string(),
});

export const PickOpSchema = z.strictObject({
  op: z.literal("pick"),
  paths: z.array(DotPathSchema).min(1),
});

export const TransformOpSchema = z.discriminatedUnion("op", [
  DefaultOpSchema,
  TemplateOpSchema,
  PickOpSchema,
]);

export const TransformStepSchema = z.strictObject({
  type: z.literal("transform"),
  ops: z.array(TransformOpSchema).min(1),
});

export const FilterOperatorSchema = z.enum(["eq", "neq"]);

export const FilterConditionSchema = z.strictObject({
  path: DotPathSchema,
  op: FilterOperatorSchema,
  value: z.json(),
});

export const FilterStepSchema = z.strictObject({
  type: z.literal("filter"),
  conditions: z.array(FilterConditionSchema).min(1),
});

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const HttpOrHttpsUrlSchema = z
  .string()
  .min(1)
  .refine((value) => /^https?:\/\//i.test(value), "must be an http: or https: URL");

export const HttpRequestBodySchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("ctx"),
  }),
  z.strictObject({
    mode: z.literal("custom"),
    json: JsonObjectSchema,
  }),
]);

export const HttpRequestStepSchema = z.strictObject({
  type: z.literal("http_request"),
  method: HttpMethodSchema,
  url: HttpOrHttpsUrlSchema,
  headers: z.record(z.string().min(1), z.string()).optional(),
  body: HttpRequestBodySchema.optional(),
  timeoutMs: z
    .int()
    .min(HTTP_TIMEOUT_MS_MIN)
    .max(HTTP_TIMEOUT_MS_MAX)
    .default(HTTP_TIMEOUT_MS_DEFAULT),
  retries: z.int().min(HTTP_RETRIES_MIN).max(HTTP_RETRIES_MAX).default(HTTP_RETRIES_DEFAULT),
});

export const WorkflowStepSchema = z.discriminatedUnion("type", [
  TransformStepSchema,
  FilterStepSchema,
  HttpRequestStepSchema,
]);

export const WorkflowStepsSchema = z.array(WorkflowStepSchema);

/** Monaco step editor payload: ordered steps, empty array allowed. */
export const WorkflowDefinitionSchema = WorkflowStepsSchema;

export type DefaultOp = z.infer<typeof DefaultOpSchema>;
export type TemplateOp = z.infer<typeof TemplateOpSchema>;
export type PickOp = z.infer<typeof PickOpSchema>;
export type TransformOp = z.infer<typeof TransformOpSchema>;
export type TransformStep = z.infer<typeof TransformStepSchema>;
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;
export type FilterCondition = z.infer<typeof FilterConditionSchema>;
export type FilterStep = z.infer<typeof FilterStepSchema>;
export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type HttpRequestBody = z.infer<typeof HttpRequestBodySchema>;
export type HttpRequestStep = z.infer<typeof HttpRequestStepSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
