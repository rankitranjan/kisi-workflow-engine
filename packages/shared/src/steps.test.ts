import { describe, expect, it } from "vitest";

import {
  FilterStepSchema,
  HttpRequestStepSchema,
  TransformStepSchema,
  WorkflowDefinitionSchema,
  WorkflowStepSchema,
  WorkflowStepsSchema,
} from "./steps.js";

function issuePaths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}): PropertyKey[][] {
  if (result.success || !result.error) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path);
}

const validTransform = {
  type: "transform",
  ops: [
    { op: "default", path: "actor_name", value: "Unknown" },
    { op: "template", to: "title", template: "Event {{type}} by {{actor_name}}" },
    {
      op: "pick",
      paths: ["uuid", "type", "success", "severity", "title"],
    },
  ],
} as const;

const validFilter = {
  type: "filter",
  conditions: [
    { path: "type", op: "eq", value: "lock.unlock" },
    { path: "success", op: "eq", value: false },
  ],
} as const;

const validHttpRequest = {
  type: "http_request",
  method: "POST",
  url: "http://localhost:9000/alerts",
  headers: {
    "Content-Type": "application/json",
    "X-Workflow-Id": "{{workflow_id}}",
  },
  body: { mode: "ctx" },
  timeoutMs: 2000,
  retries: 3,
} as const;

describe("TransformStepSchema", () => {
  it("accepts a transform with default, template, and pick ops", () => {
    const result = TransformStepSchema.safeParse(validTransform);
    expect(result.success).toBe(true);
  });

  it("rejects an empty ops list", () => {
    const result = TransformStepSchema.safeParse({ type: "transform", ops: [] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ops"]);
  });

  it("rejects an unknown transform op", () => {
    const result = TransformStepSchema.safeParse({
      type: "transform",
      ops: [{ op: "map", path: "x" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ops", 0, "op"]);
  });

  it("rejects a default op missing path", () => {
    const result = TransformStepSchema.safeParse({
      type: "transform",
      ops: [{ op: "default", value: "Unknown" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ops", 0, "path"]);
  });

  it("rejects a template op missing to", () => {
    const result = TransformStepSchema.safeParse({
      type: "transform",
      ops: [{ op: "template", template: "Hello" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ops", 0, "to"]);
  });

  it("rejects a pick op with empty paths", () => {
    const result = TransformStepSchema.safeParse({
      type: "transform",
      ops: [{ op: "pick", paths: [] }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ops", 0, "paths"]);
  });
});

describe("FilterStepSchema", () => {
  it("accepts eq and neq conditions", () => {
    const result = FilterStepSchema.safeParse({
      type: "filter",
      conditions: [
        { path: "type", op: "eq", value: "lock.unlock" },
        { path: "success", op: "neq", value: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty conditions list", () => {
    const result = FilterStepSchema.safeParse({ type: "filter", conditions: [] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["conditions"]);
  });

  it("rejects an unknown condition operator", () => {
    const result = FilterStepSchema.safeParse({
      type: "filter",
      conditions: [{ path: "type", op: "gt", value: 1 }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["conditions", 0, "op"]);
  });

  it("accepts JSON values including null", () => {
    const result = FilterStepSchema.safeParse({
      type: "filter",
      conditions: [{ path: "actor", op: "eq", value: null }],
    });
    expect(result.success).toBe(true);
  });
});

describe("HttpRequestStepSchema", () => {
  it("accepts the HTTP request example from the spec", () => {
    const result = HttpRequestStepSchema.safeParse(validHttpRequest);
    expect(result.success).toBe(true);
  });

  it("accepts a custom JSON object body", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      body: { mode: "custom", json: { content: "Alert {{title}}" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects custom body without json", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      body: { mode: "custom" },
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["body", "json"]);
  });

  it("rejects custom body when json is an array", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      body: { mode: "custom", json: [1, 2] },
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["body", "json"]);
  });

  it("rejects a non-http(s) url", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      url: "ftp://example.com/alerts",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["url"]);
  });

  it("rejects timeoutMs below 1", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      timeoutMs: 0,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["timeoutMs"]);
  });

  it("rejects timeoutMs above 10000", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      timeoutMs: 10001,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["timeoutMs"]);
  });

  it("rejects retries above 5", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      retries: 6,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["retries"]);
  });

  it("rejects negative retries", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      retries: -1,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["retries"]);
  });

  it("defaults timeoutMs to 2000 when omitted", () => {
    const { timeoutMs: _timeoutMs, ...withoutTimeout } = validHttpRequest;
    const result = HttpRequestStepSchema.safeParse(withoutTimeout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ timeoutMs: 2000 });
    }
  });

  it("defaults retries to 3 when omitted", () => {
    const { retries: _retries, ...withoutRetries } = validHttpRequest;
    const result = HttpRequestStepSchema.safeParse(withoutRetries);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ retries: 3 });
    }
  });

  it("rejects an unknown HTTP method", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      method: "HEAD",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["method"]);
  });

  it("accepts GET without a body", () => {
    const result = HttpRequestStepSchema.safeParse({
      type: "http_request",
      method: "GET",
      url: "https://example.com/health",
    });
    expect(result.success).toBe(true);
  });

  it("accepts timeoutMs and retries at the inclusive caps", () => {
    const result = HttpRequestStepSchema.safeParse({
      ...validHttpRequest,
      timeoutMs: 10000,
      retries: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("WorkflowStepSchema", () => {
  it("rejects an unknown step type", () => {
    const result = WorkflowStepSchema.safeParse({ type: "delay", ms: 1000 });
    expect(result.success).toBe(false);
  });

  it("accepts each of the three step types", () => {
    expect(WorkflowStepSchema.safeParse(validTransform).success).toBe(true);
    expect(WorkflowStepSchema.safeParse(validFilter).success).toBe(true);
    expect(WorkflowStepSchema.safeParse(validHttpRequest).success).toBe(true);
  });
});

describe("WorkflowDefinitionSchema", () => {
  it("allows an empty steps array", () => {
    const result = WorkflowDefinitionSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("accepts mixed ordered steps", () => {
    const result = WorkflowStepsSchema.safeParse([
      validFilter,
      validTransform,
      validHttpRequest,
    ]);
    expect(result.success).toBe(true);
  });
});
