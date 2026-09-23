import { HttpOrHttpsUrlSchema, WorkflowStepsSchema } from "@kisi-workflow/shared";
import type { Workflow, WorkflowStep } from "@kisi-workflow/shared";

import { WorkflowService } from "../workflows/service.js";

export const DEMO_WORKFLOW_NAME = "Demo unlock alert";

const DISCORD_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
]);

const WEBHOOK_PATH_PREFIX = "/api/webhooks/";

export class DemoWebhookUrlError extends Error {
  constructor() {
    super("DEMO_WEBHOOK_URL must be an https Discord incoming webhook URL");
    this.name = "DemoWebhookUrlError";
  }
}

export type SeedDemoResult = {
  action: "created" | "updated";
  id: string;
  triggerToken: string;
  triggerPath: string;
};

export function readDemoWebhookUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.DEMO_WEBHOOK_URL;
  if (typeof raw !== "string") {
    throw new DemoWebhookUrlError();
  }
  return parseDemoWebhookUrl(raw.trim());
}

export async function seedDemoWorkflow(
  service: WorkflowService,
  webhookUrl: string,
): Promise<SeedDemoResult> {
  const url = parseDemoWebhookUrl(webhookUrl.trim());
  const steps = demoSteps(url);
  const existing = earliestDemo(await service.list());
  if (existing === undefined) {
    const created = await service.create({
      name: DEMO_WORKFLOW_NAME,
      enabled: true,
      steps,
    });
    return {
      action: "created",
      id: created.id,
      triggerToken: created.triggerToken,
      triggerPath: created.triggerPath,
    };
  }

  const updated = await service.put(existing.id, {
    name: DEMO_WORKFLOW_NAME,
    enabled: true,
    steps,
  });
  return {
    action: "updated",
    id: updated.id,
    triggerToken: updated.triggerToken,
    triggerPath: updated.triggerPath,
  };
}

export async function seedDemoFromEnv(
  service: WorkflowService,
  env: NodeJS.ProcessEnv,
): Promise<SeedDemoResult> {
  const webhookUrl = readDemoWebhookUrl(env);
  return seedDemoWorkflow(service, webhookUrl);
}

function parseDemoWebhookUrl(value: string): string {
  if (value.length === 0 || !HttpOrHttpsUrlSchema.safeParse(value).success) {
    throw new DemoWebhookUrlError();
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DemoWebhookUrlError();
  }

  const remainder = parsed.pathname.startsWith(WEBHOOK_PATH_PREFIX)
    ? parsed.pathname.slice(WEBHOOK_PATH_PREFIX.length)
    : "";
  if (parsed.protocol !== "https:" || !DISCORD_WEBHOOK_HOSTS.has(parsed.hostname)) {
    throw new DemoWebhookUrlError();
  }
  if (remainder.replaceAll("/", "").length === 0) {
    throw new DemoWebhookUrlError();
  }
  return value;
}

function demoSteps(webhookUrl: string): WorkflowStep[] {
  return WorkflowStepsSchema.parse([
    {
      type: "filter",
      conditions: [
        { path: "type", op: "eq", value: "lock.unlock" },
        { path: "success", op: "eq", value: false },
      ],
    },
    {
      type: "transform",
      ops: [
        { op: "default", path: "actor_name", value: "Unknown" },
        { op: "template", to: "title", template: "Event {{type}} by {{actor_name}}" },
        { op: "pick", paths: ["uuid", "type", "success", "severity", "title"] },
      ],
    },
    {
      type: "http_request",
      method: "POST",
      url: webhookUrl,
      headers: {
        "Content-Type": "application/json",
        "X-Workflow-Id": "{{workflow_id}}",
      },
      body: { mode: "custom", json: { content: "{{title}}" } },
      timeoutMs: 2000,
      retries: 3,
    },
  ]);
}

function earliestDemo(workflows: readonly Workflow[]): Workflow | undefined {
  const matches = workflows.filter((workflow) => workflow.name === DEMO_WORKFLOW_NAME);
  matches.sort((left, right) => {
    if (left.createdAt < right.createdAt) {
      return -1;
    }
    if (left.createdAt > right.createdAt) {
      return 1;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
  return matches[0];
}
