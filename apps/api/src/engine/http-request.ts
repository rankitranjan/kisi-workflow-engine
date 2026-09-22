import {
  HTTP_RETRIES_MAX,
  HTTP_RETRIES_MIN,
  HTTP_TIMEOUT_MS_MAX,
  HTTP_TIMEOUT_MS_MIN,
} from "@kisi-workflow/shared";
import type { HttpRequestStep, JsonObject } from "@kisi-workflow/shared";

import { StepFailedError } from "./errors.js";
import { interpolate, type TemplateBindings } from "./template.js";
import {
  assertOutboundUrl,
  resolveHostname,
  SsrfBlockedError,
  type DnsResolver,
} from "../security/ssrf.js";

const HTTP_ERROR_BODY_MAX = 1024;

export type HttpExecutorDeps = {
  fetchImpl: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  allowPrivateUrls?: boolean;
  bindings?: TemplateBindings;
  now?: () => Date;
  deadlineAt?: number;
  resolve?: DnsResolver;
};

const WORKFLOW_TIME_LIMIT = "workflow time limit exceeded";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function httpRetryDelayMs(attempt: number, random: () => number): number {
  const base = Math.min(1000 * 2 ** attempt, 4000);
  const jitter = Math.min(100, Math.floor(random() * 101));
  return base + jitter;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function httpMessage(status: number, body: string): string {
  const truncated = body.slice(0, HTTP_ERROR_BODY_MAX);
  if (truncated.length === 0) {
    return `HTTP ${status}`;
  }
  return `HTTP ${status}: ${truncated}`;
}

function interpolateJson(value: unknown, ctx: JsonObject, bindings?: TemplateBindings): unknown {
  if (typeof value === "string") {
    return interpolate(value, ctx, bindings);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateJson(item, ctx, bindings));
  }
  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] = interpolateJson(child, ctx, bindings);
    }
    return next;
  }
  return value;
}

function requestBody(step: HttpRequestStep, ctx: JsonObject, bindings?: TemplateBindings): string | undefined {
  if (!step.body) {
    return undefined;
  }
  if (step.body.mode === "ctx") {
    return JSON.stringify(ctx);
  }
  return JSON.stringify(interpolateJson(step.body.json, ctx, bindings));
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function fetchWithTimeout(
  step: HttpRequestStep,
  ctx: JsonObject,
  deps: HttpExecutorDeps,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method: step.method,
      redirect: "manual",
      signal: controller.signal,
    };
    if (step.headers) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(step.headers)) {
        headers[key] = interpolate(value, ctx, deps.bindings);
      }
      init.headers = headers;
    }
    const body = requestBody(step, ctx, deps.bindings);
    if (body !== undefined) {
      init.body = body;
    }
    return await deps.fetchImpl(step.url, init);
  } finally {
    clearTimeout(timer);
  }
}

function remainingMs(deps: HttpExecutorDeps): number | undefined {
  if (deps.deadlineAt === undefined || deps.now === undefined) {
    return undefined;
  }
  return deps.deadlineAt - deps.now().getTime();
}

function timeLimitError(): StepFailedError {
  return new StepFailedError("http_request", WORKFLOW_TIME_LIMIT);
}

export async function executeHttpRequest(
  step: HttpRequestStep,
  ctx: JsonObject,
  deps: HttpExecutorDeps,
): Promise<void> {
  const retries = Math.min(Math.max(step.retries, HTTP_RETRIES_MIN), HTTP_RETRIES_MAX);
  const timeoutMs = Math.min(Math.max(step.timeoutMs, HTTP_TIMEOUT_MS_MIN), HTTP_TIMEOUT_MS_MAX);
  const sleep = deps.sleep ?? delay;
  const random = deps.random ?? Math.random;
  const allowPrivateUrls = deps.allowPrivateUrls ?? false;
  const resolve = deps.resolve ?? resolveHostname;
  let lastFailure = new StepFailedError("http_request", "network error");

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const remaining = remainingMs(deps);
    if (remaining !== undefined && remaining <= 0) {
      throw timeLimitError();
    }
    const attemptTimeout = remaining === undefined ? timeoutMs : Math.min(timeoutMs, remaining);
    const deadlineLimited = remaining !== undefined && attemptTimeout < timeoutMs;

    try {
      await assertOutboundUrl(step.url, allowPrivateUrls, resolve);
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        throw new StepFailedError("http_request", "blocked URL");
      }
      throw error;
    }

    try {
      const response = await fetchWithTimeout(step, ctx, deps, attemptTimeout);
      if (response.status >= 200 && response.status < 300) {
        return;
      }
      const body = await readBody(response);
      const failure = new StepFailedError("http_request", httpMessage(response.status, body), response.status);
      if (response.status < 500 || response.status > 599) {
        throw failure;
      }
      lastFailure = failure;
    } catch (error) {
      if (error instanceof StepFailedError) {
        throw error;
      }
      if (isAbortError(error) && (deadlineLimited || deadlineReached(deps))) {
        throw timeLimitError();
      }
      const message = isAbortError(error)
        ? "request timed out"
        : error instanceof Error && error.message.length > 0
          ? error.message
          : "network error";
      lastFailure = new StepFailedError("http_request", message);
    }

    if (attempt < retries) {
      const delayMs = httpRetryDelayMs(attempt, random);
      const beforeSleep = remainingMs(deps);
      if (beforeSleep !== undefined && (beforeSleep <= 0 || delayMs > beforeSleep)) {
        throw timeLimitError();
      }
      await sleep(delayMs);
    }
  }

  throw lastFailure;
}

function deadlineReached(deps: HttpExecutorDeps): boolean {
  return deps.deadlineAt !== undefined && deps.now !== undefined && deps.now().getTime() >= deps.deadlineAt;
}
