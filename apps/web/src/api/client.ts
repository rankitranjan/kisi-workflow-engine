import {
  ApiErrorSchema,
  WorkflowSchema,
  type ApiError,
  type Workflow,
  type WorkflowCreate,
  type WorkflowPut,
} from "@kisi-workflow/shared";

export const MISSING_DEMO_ACCESS_KEY_MESSAGE =
  "The demo access credential is not configured. Set VITE_DEMO_ACCESS_KEY to the same value as the API DEMO_ACCESS_KEY. This value is a demo browser credential, not a secret.";

type DemoAccessEnv = {
  VITE_DEMO_ACCESS_KEY?: string;
};

export class MissingDemoAccessKeyError extends Error {
  constructor() {
    super(MISSING_DEMO_ACCESS_KEY_MESSAGE);
    this.name = "MissingDemoAccessKeyError";
  }
}

export class ApiClientError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.error);
    this.name = "ApiClientError";
    this.apiError = apiError;
  }
}

export function readDemoAccessKey(source: DemoAccessEnv = import.meta.env): string | undefined {
  const value = source.VITE_DEMO_ACCESS_KEY;
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return value;
}

export function formatApiError(error: unknown): string {
  if (error instanceof MissingDemoAccessKeyError) {
    return MISSING_DEMO_ACCESS_KEY_MESSAGE;
  }
  if (error instanceof ApiClientError) {
    return messageForApiError(error.apiError);
  }
  return "Something went wrong. Try again.";
}

function messageForApiError(error: ApiError): string {
  switch (error.error) {
    case "unauthorized":
      return "The demo access credential was rejected.";
    case "not_found":
      return "This workflow was not found.";
    case "payload_too_large":
      return "The workflow is too large to save.";
    case "internal_error":
      return "Something went wrong. Try again.";
    case "workflow_disabled":
      return "This workflow is disabled.";
    case "validation_error": {
      const fieldMessages = Object.entries(error.details.fieldErrors).flatMap(([field, messages]) =>
        messages.map((message) => `${field}: ${message}`),
      );
      const parts = [...error.details.formErrors, ...fieldMessages];
      return parts.length > 0 ? parts.join("\n") : "The workflow is invalid.";
    }
  }
}

function workflowUrl(id: string): string {
  return `/workflows/${encodeURIComponent(id)}`;
}

function resolveApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL;
  if (typeof base !== "string" || base.length === 0) {
    return path;
  }
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}${path}`;
}

async function send(path: string, init: { method: string; body?: string }): Promise<unknown> {
  const key = readDemoAccessKey();
  if (key === undefined) {
    throw new MissingDemoAccessKeyError();
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-demo-key": key,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(resolveApiUrl(path), {
    method: init.method,
    headers,
    body: init.body,
  });

  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  let payload: unknown;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new ApiClientError(parsed.data);
  }

  return payload;
}

function parseWorkflow(payload: unknown): Workflow {
  const parsed = WorkflowSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected workflow response");
  }
  return parsed.data;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const payload = await send("/workflows", { method: "GET" });
  const parsed = WorkflowSchema.array().safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected workflow response");
  }
  return parsed.data;
}

export async function getWorkflow(id: string): Promise<Workflow> {
  return parseWorkflow(await send(workflowUrl(id), { method: "GET" }));
}

export async function createWorkflow(body: WorkflowCreate): Promise<Workflow> {
  return parseWorkflow(await send("/workflows", { method: "POST", body: JSON.stringify(body) }));
}

export async function replaceWorkflow(id: string, body: WorkflowPut): Promise<Workflow> {
  return parseWorkflow(await send(workflowUrl(id), { method: "PUT", body: JSON.stringify(body) }));
}

export async function setWorkflowEnabled(id: string, enabled: boolean): Promise<Workflow> {
  return parseWorkflow(
    await send(workflowUrl(id), { method: "PATCH", body: JSON.stringify({ enabled }) }),
  );
}

export async function deleteWorkflow(id: string): Promise<void> {
  await send(workflowUrl(id), { method: "DELETE" });
}
