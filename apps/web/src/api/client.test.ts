import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sampleWorkflowDetail, sampleWorkflowListItem } from "../test/fixtures";
import {
  ApiClientError,
  MissingDemoAccessKeyError,
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  readDemoAccessKey,
  replaceWorkflow,
  setWorkflowEnabled,
} from "./client";

const workflow = sampleWorkflowDetail();
const listItem = sampleWorkflowListItem();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

describe("workflow API client", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VITE_DEMO_ACCESS_KEY", "demo-access-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads the demo browser credential", () => {
    expect(readDemoAccessKey()).toBe("demo-access-key");
    expect(readDemoAccessKey({ VITE_DEMO_ACCESS_KEY: "" })).toBeUndefined();
    expect(readDemoAccessKey({})).toBeUndefined();
  });

  it("does not call fetch when the demo credential is missing", async () => {
    vi.stubEnv("VITE_DEMO_ACCESS_KEY", "");
    await expect(listWorkflows()).rejects.toBeInstanceOf(MissingDemoAccessKeyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists workflows with the demo credential header", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [listItem]));

    await expect(listWorkflows()).resolves.toEqual([listItem]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/workflows");
    expect(init?.method).toBe("GET");
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
    expect(headerValue(init, "accept")).toBe("application/json");
    expect(String(url)).not.toMatch(/^\/t\//);
  });

  it("sends workflow collection requests to VITE_API_URL", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    fetchMock.mockResolvedValue(jsonResponse(200, [listItem]));

    await listWorkflows();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.com/workflows");
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
  });

  it("sends workflow-by-id requests to VITE_API_URL", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    fetchMock.mockResolvedValue(jsonResponse(200, workflow));

    await getWorkflow(workflow.id);

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.example.com/workflows/${workflow.id}`);
  });

  it("does not insert a double slash when VITE_API_URL has a trailing slash", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/");
    fetchMock.mockResolvedValue(jsonResponse(200, [listItem]));

    await listWorkflows();

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.com/workflows");
  });

  it("throws the shared unauthorized error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));

    const error: unknown = await listWorkflows().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ apiError: { error: "unauthorized" } });
  });

  it("creates a workflow", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, workflow));
    const body = { name: "Unlock alerts", enabled: true, steps: [] };

    await expect(createWorkflow(body)).resolves.toEqual(workflow);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/workflows");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(body));
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
    expect(headerValue(init, "content-type")).toBe("application/json");
  });

  it("gets a workflow by id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, workflow));

    await expect(getWorkflow(workflow.id)).resolves.toEqual(workflow);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/workflows/${workflow.id}`);
    expect(init?.method).toBe("GET");
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
  });

  it("replaces a workflow with PUT", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, workflow));
    const body = { name: "Renamed", enabled: false, steps: [] };

    await expect(replaceWorkflow(workflow.id, body)).resolves.toEqual(workflow);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/workflows/${workflow.id}`);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify(body));
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
  });

  it("patches enabled state", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...workflow, enabled: false }));

    await expect(setWorkflowEnabled(workflow.id, false)).resolves.toMatchObject({
      enabled: false,
      triggerUrl: workflow.triggerUrl,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/workflows/${workflow.id}`);
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ enabled: false }));
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
  });

  it("resolves delete on 204 with no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteWorkflow(workflow.id)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/workflows/${workflow.id}`);
    expect(init?.method).toBe("DELETE");
    expect(headerValue(init, "x-demo-key")).toBe("demo-access-key");
  });

  it("rejects a success body that is not a workflow", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { name: "Unlock alerts" }));

    await expect(getWorkflow(workflow.id)).rejects.toThrow(/workflow response/i);
  });

  it("throws the shared validation error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: "validation_error",
        details: { formErrors: ["invalid"], fieldErrors: { name: ["Required"] } },
      }),
    );

    await expect(createWorkflow({ name: "Unlock alerts", enabled: true, steps: [] })).rejects.toMatchObject({
      apiError: {
        error: "validation_error",
        details: { fieldErrors: { name: ["Required"] } },
      },
    });
  });
});
