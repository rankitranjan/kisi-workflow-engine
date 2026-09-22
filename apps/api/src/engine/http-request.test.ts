import type { HttpRequestStep, JsonObject } from "@kisi-workflow/shared";
import { describe, expect, it, vi } from "vitest";

import type { DnsResolver } from "../security/ssrf.js";
import { executeHttpRequest, httpRetryDelayMs } from "./http-request.js";
import { StepFailedError } from "./errors.js";

const publicResolve: DnsResolver = async () => [{ address: "8.8.8.8", family: 4 }];

const workflowId = "22222222-2222-4222-8222-222222222222";

function step(overrides: Partial<HttpRequestStep> = {}): HttpRequestStep {
  return {
    type: "http_request",
    method: "POST",
    url: "https://alerts.example.com/hook",
    timeoutMs: 1000,
    retries: 0,
    ...overrides,
  };
}

function jsonResponse(status: number, body = ""): Response {
  if (body.length === 0 && (status === 204 || status === 205 || status === 304)) {
    return new Response(null, { status });
  }
  return new Response(body, { status });
}

function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      const abort = () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    })) as typeof fetch;
}

describe("httpRetryDelayMs", () => {
  it("uses exponential backoff capped at 4000ms", () => {
    expect(httpRetryDelayMs(0, () => 0)).toBe(1000);
    expect(httpRetryDelayMs(1, () => 0)).toBe(2000);
    expect(httpRetryDelayMs(2, () => 0)).toBe(4000);
    expect(httpRetryDelayMs(4, () => 0)).toBe(4000);
  });

  it("adds jitter in the range 0 to 100ms", () => {
    expect(httpRetryDelayMs(0, () => 0)).toBe(1000);
    expect(httpRetryDelayMs(0, () => 0.999)).toBe(1100);
  });
});

describe("executeHttpRequest", () => {
  it("sends the configured method, url, interpolated headers, and context body", async () => {
    const ctx: JsonObject = { type: "lock.unlock", success: false };
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200));
    await executeHttpRequest(step({
      headers: {
        "Content-Type": "application/json",
        "X-Workflow-Id": "{{workflow_id}}",
      },
      body: { mode: "ctx" },
    }), ctx, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
      bindings: { workflow_id: workflowId },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://alerts.example.com/hook");
    expect(call?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workflow-Id": workflowId,
      },
      body: JSON.stringify(ctx),
      redirect: "manual",
    });
    expect(ctx).toEqual({ type: "lock.unlock", success: false });
  });

  it("interpolates a custom JSON body and leaves non-strings unchanged", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200));
    await executeHttpRequest(step({
      body: { mode: "custom", json: { content: "Alert {{title}}", n: 1 } },
    }), { title: "Door" }, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ content: "Alert Door", n: 1 }),
    });
  });

  it("omits the body when the step has no body configuration", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(204));
    await executeHttpRequest(step({ method: "GET" }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("forwards PUT, PATCH, and DELETE", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200));
      await executeHttpRequest(step({ method }), {}, {
        fetchImpl: fetchMock,
        sleep: async () => {},
        random: () => 0, resolve: publicResolve,
      });
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe(method);
    }
  });

  it("succeeds on HTTP 2xx without changing context", async () => {
    const ctx = { ok: true };
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(204));
    await expect(executeHttpRequest(step(), ctx, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ctx).toEqual({ ok: true });
  });

  it("retries HTTP 5xx and then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, "unavailable"))
      .mockResolvedValueOnce(jsonResponse(502, "bad gateway"))
      .mockResolvedValueOnce(jsonResponse(200));
    await executeHttpRequest(step({ retries: 2 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0, resolve: publicResolve,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[httpRetryDelayMs(0, () => 0)], [httpRetryDelayMs(1, () => 0)]]);
  });

  it("retries network failures and then succeeds", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("connect ECONNRESET"))
      .mockRejectedValueOnce(new Error("connect ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(200));
    await executeHttpRequest(step({ retries: 2 }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry HTTP 4xx", async () => {
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(400, "bad request"));
    await expect(executeHttpRequest(step({ retries: 5 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0, resolve: publicResolve,
    })).rejects.toMatchObject({
      name: "StepFailedError",
      stepType: "http_request",
      httpStatus: 400,
      message: "HTTP 400: bad request",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry HTTP 429", async () => {
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(429, "slow down"));
    await expect(executeHttpRequest(step({ retries: 5 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0, resolve: publicResolve,
    })).rejects.toMatchObject({
      httpStatus: 429,
      message: "HTTP 429: slow down",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("fails a timeout after the configured retries", async () => {
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn<typeof fetch>(hangingFetch());
    const error = await executeHttpRequest(step({ retries: 1, timeoutMs: 20 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0, resolve: publicResolve,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StepFailedError);
    expect(error).toMatchObject({
      stepType: "http_request",
      message: "request timed out",
    });
    expect(error).not.toHaveProperty("httpStatus", expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry a blocked URL and does not call fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200));
    await expect(executeHttpRequest(step({
      url: "http://127.0.0.1:9000/alerts",
      retries: 4,
    }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    })).rejects.toMatchObject({
      stepType: "http_request",
      message: "blocked URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("performs a single attempt when retries is 0", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(500, "down"));
    await expect(executeHttpRequest(step({ retries: 0 }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    })).rejects.toMatchObject({ httpStatus: 500, message: "HTTP 500: down" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call fetch when a hostname resolves to a private address", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200));
    const resolve = vi.fn<DnsResolver>(async () => [{ address: "10.1.2.3", family: 4 }]);
    await expect(executeHttpRequest(step({ retries: 4 }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0,
      resolve,
    })).rejects.toMatchObject({
      stepType: "http_request",
      message: "blocked URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("fetches a privately resolved hostname when private hosts are allowed", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200));
    const resolve = vi.fn<DnsResolver>(async () => [{ address: "10.0.0.8", family: 4 }]);
    await executeHttpRequest(step({ url: "https://internal.example/hook", retries: 0 }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0,
      allowPrivateUrls: true,
      resolve,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("caps the request timeout by the remaining workflow time", async () => {
    const start = Date.now();
    const fetchMock = vi.fn<typeof fetch>(hangingFetch());
    const sleep = vi.fn(async () => {});
    await expect(executeHttpRequest(step({ timeoutMs: 5000, retries: 2 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0,
      resolve: publicResolve,
      now: () => new Date(start),
      deadlineAt: start + 40,
    })).rejects.toMatchObject({
      stepType: "http_request",
      message: "workflow time limit exceeded",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(Date.now() - start).toBeLessThan(1000);
  }, 1500);

  it("does not sleep past the workflow deadline", async () => {
    const start = Date.parse("2026-09-23T00:00:00.000Z");
    let clock = start;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(500, "unavailable"));
    const error = await executeHttpRequest(step({ retries: 2, timeoutMs: 1000 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0,
      resolve: publicResolve,
      now: () => new Date(clock),
      deadlineAt: start + 500,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      stepType: "http_request",
      message: "workflow time limit exceeded",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clock).toBeLessThanOrEqual(start + 500);
  });

  it("keeps a single attempt when retries is 0 and the deadline is later", async () => {
    const start = Date.parse("2026-09-23T00:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(500, "down"));
    const sleep = vi.fn(async () => {});
    await expect(executeHttpRequest(step({ retries: 0, timeoutMs: 1000 }), {}, {
      fetchImpl: fetchMock,
      sleep,
      random: () => 0,
      resolve: publicResolve,
      now: () => new Date(start),
      deadlineAt: start + 25_000,
    })).rejects.toMatchObject({ httpStatus: 500, message: "HTTP 500: down" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("truncates an HTTP error body to 1024 characters", async () => {
    const body = "x".repeat(1200);
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(500, body));
    await expect(executeHttpRequest(step({ retries: 0 }), {}, {
      fetchImpl: fetchMock,
      sleep: async () => {},
      random: () => 0, resolve: publicResolve,
    })).rejects.toMatchObject({
      message: `HTTP 500: ${"x".repeat(1024)}`,
    });
  });
});
