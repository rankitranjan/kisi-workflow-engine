import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  TriggerResponseSchema,
  WorkflowDisabledErrorSchema,
  type WorkflowStep,
} from "@kisi-workflow/shared";
import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test, type MockWebhook } from "./mock-webhook.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

const transformedPayload = {
  type: "lock.unlock",
  actor_name: "Unknown",
  title: "Event lock.unlock by Unknown",
};

function steps(webhookUrl: string): WorkflowStep[] {
  return [
    {
      type: "filter",
      conditions: [{ path: "type", op: "eq", value: "lock.unlock" }],
    },
    {
      type: "transform",
      ops: [
        { op: "default", path: "actor_name", value: "Unknown" },
        { op: "template", to: "title", template: "Event {{type}} by {{actor_name}}" },
      ],
    },
    {
      type: "http_request",
      method: "POST",
      url: webhookUrl,
      headers: { "Content-Type": "application/json" },
      body: { mode: "ctx" },
      timeoutMs: 2000,
      retries: 0,
    },
  ];
}

async function truncateWorkflows(): Promise<void> {
  await execFileAsync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "kisi",
      "-d",
      "workflow_engine_e2e",
      "-c",
      'TRUNCATE TABLE "workflows" CASCADE',
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

async function setSteps(page: Page, value: WorkflowStep[]): Promise<void> {
  await expect(page.getByRole("textbox", { name: "Workflow steps" })).toBeVisible();
  const text = JSON.stringify(value, null, 2);
  await page.evaluate((next) => {
    const monaco = (
      globalThis as unknown as {
        monaco?: { editor: { getModels: () => { setValue: (value: string) => void }[] } };
      }
    ).monaco;
    const model = monaco?.editor.getModels()[0];
    if (!model) {
      throw new Error("Monaco model was not ready");
    }
    model.setValue(next);
  }, text);
}

async function createWorkflow(
  page: Page,
  options: { enabled: boolean; webhookUrl: string },
): Promise<string> {
  await page.goto("/");
  await page.getByRole("link", { name: "Create workflow" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Unlock alerts");
  const enabled = page.getByRole("checkbox", { name: "Enabled" });
  if (options.enabled) {
    await enabled.check();
  } else {
    await enabled.uncheck();
  }
  await setSteps(page, steps(options.webhookUrl));
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeEnabled();
  await save.click();
  const triggerUrl = page.getByRole("textbox", { name: "Trigger URL" });
  await expect(triggerUrl).toBeVisible();
  return triggerUrl.inputValue();
}

function capturedCalls(webhook: MockWebhook): { method: string; path: string; body: unknown }[] {
  return webhook.requests.map((request) => ({
    method: request.method,
    path: request.path,
    body: request.body,
  }));
}

async function trigger(
  request: APIRequestContext,
  triggerUrl: string,
  body: { type: string },
): Promise<{ status: number; json: unknown }> {
  const response = await request.post(triggerUrl, { data: body });
  return { status: response.status(), json: await response.json() };
}

test.beforeEach(async ({ webhook }) => {
  await truncateWorkflows();
  webhook.clear();
});

test("matching trigger posts the transformed context to the mock webhook", async ({ page, request, webhook }) => {
  const triggerUrl = await createWorkflow(page, { enabled: true, webhookUrl: webhook.url });
  const response = await trigger(request, triggerUrl, { type: "lock.unlock" });

  expect(response.status).toBe(200);
  const body = TriggerResponseSchema.parse(response.json);
  expect(body.status).toBe("success");
  expect(body.error).toBeNull();
  expect(capturedCalls(webhook)).toEqual([
    { method: "POST", path: "/hook", body: transformedPayload },
  ]);
});

test("non-matching filter skips and does not call the webhook", async ({ page, request, webhook }) => {
  const triggerUrl = await createWorkflow(page, { enabled: true, webhookUrl: webhook.url });
  const response = await trigger(request, triggerUrl, { type: "lock.lock" });

  expect(response.status).toBe(200);
  const body = TriggerResponseSchema.parse(response.json);
  expect(body.status).toBe("skipped");
  expect(body.error).toBeNull();
  expect(webhook.requests).toEqual([]);
});

test("disabled workflow trigger returns 403 and does not call the webhook", async ({ page, request, webhook }) => {
  const triggerUrl = await createWorkflow(page, { enabled: false, webhookUrl: webhook.url });
  const response = await trigger(request, triggerUrl, { type: "lock.unlock" });

  expect(response.status).toBe(403);
  expect(WorkflowDisabledErrorSchema.parse(response.json)).toEqual({ error: "workflow_disabled" });
  expect(webhook.requests).toEqual([]);
});
