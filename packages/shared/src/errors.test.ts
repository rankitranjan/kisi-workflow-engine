import { describe, expect, it } from "vitest";

import { ApiErrorSchema } from "./errors.js";
import { WorkflowCreateSchema } from "./workflow.js";

function issuePaths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): PropertyKey[][] {
  if (result.success || !result.error) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path);
}

describe("ApiErrorSchema", () => {
  it("accepts a validation_error DTO built from Zod flatten()", () => {
    const parsed = WorkflowCreateSchema.safeParse({ name: "", steps: [] });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    const dto = {
      error: "validation_error",
      details: parsed.error.flatten(),
    };
    expect(ApiErrorSchema.safeParse(dto).success).toBe(true);
  });

  it("rejects validation_error without details", () => {
    const result = ApiErrorSchema.safeParse({ error: "validation_error" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["details"]);
  });

  it("accepts workflow_disabled", () => {
    expect(ApiErrorSchema.safeParse({ error: "workflow_disabled" }).success).toBe(true);
  });

  it("accepts unauthorized, not_found, payload_too_large, and internal_error", () => {
    expect(ApiErrorSchema.safeParse({ error: "unauthorized" }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: "not_found" }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: "payload_too_large" }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: "internal_error" }).success).toBe(true);
  });

  it("rejects an unknown error code", () => {
    const result = ApiErrorSchema.safeParse({ error: "teapots" });
    expect(result.success).toBe(false);
  });
});
