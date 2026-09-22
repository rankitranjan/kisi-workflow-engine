import { describe, expect, it } from "vitest";

import { WorkflowCreateSchema, WorkflowPatchSchema, WorkflowSchema } from "./workflow.js";

function issuePaths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): PropertyKey[][] {
  if (result.success || !result.error) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path);
}

function unrecognizedKeys(result: {
  success: boolean;
  error?: { issues: { code?: string; keys?: string[] }[] };
}): string[] {
  if (result.success || !result.error) {
    return [];
  }
  return result.error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys" && issue.keys ? issue.keys : [],
  );
}

const token = "4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e";

const validCreate = {
  name: "Unlock alerts",
  steps: [],
};

const validWorkflow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Unlock alerts",
  enabled: true,
  triggerToken: token,
  triggerPath: `/t/${token}`,
  triggerUrl: `https://example.com/t/${token}`,
  steps: [],
  createdAt: "2026-09-22T07:12:00.000Z",
  updatedAt: "2026-09-22T07:12:00.000Z",
};

describe("WorkflowCreateSchema", () => {
  it("accepts a create payload with empty steps", () => {
    const result = WorkflowCreateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it("defaults enabled to true", () => {
    const result = WorkflowCreateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ enabled: true });
    }
  });

  it("preserves enabled false", () => {
    const result = WorkflowCreateSchema.safeParse({ ...validCreate, enabled: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ enabled: false });
    }
  });

  it("rejects an empty name", () => {
    const result = WorkflowCreateSchema.safeParse({ name: "", steps: [] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["name"]);
  });

  it("rejects a whitespace-only name", () => {
    const result = WorkflowCreateSchema.safeParse({ name: "   ", steps: [] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["name"]);
  });

  it("rejects a name longer than 100 characters", () => {
    const result = WorkflowCreateSchema.safeParse({
      name: "n".repeat(101),
      steps: [],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["name"]);
  });

  it("accepts a name of 100 characters", () => {
    const result = WorkflowCreateSchema.safeParse({
      name: "n".repeat(100),
      steps: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing steps", () => {
    const result = WorkflowCreateSchema.safeParse({ name: "Unlock alerts" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["steps"]);
  });

  it("rejects extra keys such as triggerToken", () => {
    const result = WorkflowCreateSchema.safeParse({
      ...validCreate,
      triggerToken: token,
    });
    expect(result.success).toBe(false);
    expect(unrecognizedKeys(result)).toContain("triggerToken");
  });
});

describe("WorkflowPatchSchema", () => {
  it("accepts an empty patch", () => {
    const result = WorkflowPatchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBeUndefined();
    }
  });

  it("accepts a subset of fields", () => {
    const result = WorkflowPatchSchema.safeParse({ enabled: false, name: "Renamed" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid steps in a patch", () => {
    const result = WorkflowPatchSchema.safeParse({
      steps: [{ type: "delay" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["steps", 0, "type"]);
  });

  it("rejects triggerToken so the token stays immutable", () => {
    const result = WorkflowPatchSchema.safeParse({ triggerToken: token });
    expect(result.success).toBe(false);
    expect(unrecognizedKeys(result)).toContain("triggerToken");
  });
});

describe("WorkflowSchema", () => {
  it("accepts a complete workflow response", () => {
    const result = WorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it("rejects a triggerToken that is not 32 lowercase hex chars", () => {
    const result = WorkflowSchema.safeParse({
      ...validWorkflow,
      triggerToken: "4F1F9A2C9B7F4F2A9B2E2F7D4A3C1B0E",
      triggerPath: "/t/4F1F9A2C9B7F4F2A9B2E2F7D4A3C1B0E",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["triggerToken"]);
  });

  it("rejects a triggerPath that does not match the token", () => {
    const result = WorkflowSchema.safeParse({
      ...validWorkflow,
      triggerPath: "/t/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["triggerPath"]);
  });
});
