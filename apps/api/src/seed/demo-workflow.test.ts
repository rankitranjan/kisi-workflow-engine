import { TriggerTokenSchema, type WorkflowStep } from "@kisi-workflow/shared";
import { describe, expect, it } from "vitest";

import { InMemoryWorkflowRepository } from "../db/in-memory-workflow-repository.js";
import type { PersistedWorkflow, WorkflowRepository } from "../db/workflow-repository.js";
import { WorkflowService } from "../workflows/service.js";
import { DemoWebhookUrlError, seedDemoFromEnv } from "./demo-workflow.js";

const FIXTURE_URL = "https://discord.com/api/webhooks/example/example";
const ROTATED_URL = "https://discord.com/api/webhooks/example/rotated";
const DEMO_NAME = "Demo unlock alert";

function expectedSteps(webhookUrl: string): WorkflowStep[] {
  return [
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
  ];
}

function setup(): { repository: InMemoryWorkflowRepository; service: WorkflowService } {
  const repository = new InMemoryWorkflowRepository();
  const service = new WorkflowService(repository, "https://example.com");
  return { repository, service };
}

async function expectRejectedUrl(
  repository: InMemoryWorkflowRepository,
  service: WorkflowService,
  webhookUrl: string | undefined,
): Promise<void> {
  const env: NodeJS.ProcessEnv = {};
  if (webhookUrl !== undefined) {
    env.DEMO_WEBHOOK_URL = webhookUrl;
  }
  await expect(seedDemoFromEnv(service, env)).rejects.toThrow(DemoWebhookUrlError);
  await expect(seedDemoFromEnv(service, env)).rejects.toThrow(
    "DEMO_WEBHOOK_URL must be an https Discord incoming webhook URL",
  );
  expect(await repository.list()).toEqual([]);
}

describe("seedDemoFromEnv webhook URL", () => {
  it("creates nothing when DEMO_WEBHOOK_URL is missing", async () => {
    const { repository, service } = setup();
    await expectRejectedUrl(repository, service, undefined);
  });

  it("creates nothing when DEMO_WEBHOOK_URL is blank", async () => {
    const { repository, service } = setup();
    await expectRejectedUrl(repository, service, "   ");
  });

  it("creates nothing when DEMO_WEBHOOK_URL is not https", async () => {
    const { repository, service } = setup();
    const webhookUrl = "http://discord.com/api/webhooks/example/example";
    try {
      await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: webhookUrl });
      expect.fail("expected an invalid webhook URL to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DemoWebhookUrlError);
      expect(error instanceof Error ? error.message : "").not.toContain(webhookUrl);
    }
    expect(await repository.list()).toEqual([]);
  });

  it("creates nothing when the host is not a Discord webhook host", async () => {
    const { repository, service } = setup();
    await expectRejectedUrl(repository, service, "https://example.com/api/webhooks/example/example");
  });

  it("creates nothing when the path is not a Discord webhook path", async () => {
    const { repository, service } = setup();
    await expectRejectedUrl(repository, service, "https://discord.com/api/v10/channels");
  });
});

describe("seedDemoFromEnv upsert", () => {
  it("creates one enabled demo workflow", async () => {
    const { repository, service } = setup();
    const result = await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: FIXTURE_URL });
    const rows = await repository.list();

    expect(result.action).toBe("created");
    expect(rows).toHaveLength(1);
    const workflow = rows[0];
    expect(workflow).toBeDefined();
    expect(workflow?.name).toBe(DEMO_NAME);
    expect(workflow?.enabled).toBe(true);
    expect(workflow?.id).toBe(result.id);
    expect(TriggerTokenSchema.safeParse(result.triggerToken).success).toBe(true);
    expect(result.triggerPath).toBe(`/t/${result.triggerToken}`);
    expect(workflow?.triggerToken).toBe(result.triggerToken);
    expect(workflow?.triggerPath).toBe(result.triggerPath);
    expect(workflow?.steps).toEqual(expectedSteps(FIXTURE_URL));
  });

  it("updates the webhook URL and preserves id and trigger token", async () => {
    const { repository, service } = setup();
    const created = await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: FIXTURE_URL });
    const updated = await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: ROTATED_URL });
    const rows = await repository.list();

    expect(updated.action).toBe("updated");
    expect(rows).toHaveLength(1);
    expect(updated.id).toBe(created.id);
    expect(updated.triggerToken).toBe(created.triggerToken);
    expect(updated.triggerPath).toBe(created.triggerPath);
    expect(rows[0]?.steps).toEqual(expectedSteps(ROTATED_URL));
    expect(rows[0]?.enabled).toBe(true);
  });

  it("reenables a disabled demo workflow", async () => {
    const { repository, service } = setup();
    const existing = await service.create({
      name: DEMO_NAME,
      enabled: false,
      steps: [],
    });
    const result = await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: FIXTURE_URL });
    const rows = await repository.list();

    expect(result.action).toBe("updated");
    expect(rows).toHaveLength(1);
    expect(result.id).toBe(existing.id);
    expect(result.triggerToken).toBe(existing.triggerToken);
    expect(result.triggerPath).toBe(existing.triggerPath);
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[0]?.steps).toEqual(expectedSteps(FIXTURE_URL));
  });

  it("leaves a differently named workflow unchanged", async () => {
    const { repository, service } = setup();
    const other = await service.create({
      name: "Unlock alerts",
      enabled: false,
      steps: [],
    });
    await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: FIXTURE_URL });
    const rows = await repository.list();
    const untouched = rows.find((workflow) => workflow.id === other.id);

    expect(rows).toHaveLength(2);
    expect(untouched).toMatchObject({
      name: "Unlock alerts",
      enabled: false,
      triggerToken: other.triggerToken,
      triggerPath: other.triggerPath,
      steps: [],
    });
  });

  it("updates the earliest demo workflow when duplicate names exist", async () => {
    const earlier = persistedDemo("00000000-0000-4000-8000-00000000000b", "2026-09-24T00:00:00.000Z");
    const later = persistedDemo("00000000-0000-4000-8000-000000000001", "2026-09-24T00:00:01.000Z");
    const repository = new FixedWorkflowRepository([later, earlier]);
    const service = new WorkflowService(repository, "https://example.com");

    const result = await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: FIXTURE_URL });
    const rows = await repository.list();

    expect(result.action).toBe("updated");
    expect(rows).toHaveLength(2);
    expect(result.id).toBe(earlier.id);
    expect(result.triggerToken).toBe(earlier.triggerToken);
    expect(result.triggerPath).toBe(earlier.triggerPath);
    expect(rows.find((workflow) => workflow.id === earlier.id)?.steps).toEqual(expectedSteps(FIXTURE_URL));
    expect(rows.find((workflow) => workflow.id === later.id)?.steps).toEqual([]);
  });

  it("updates the lowest id when demo workflows share a createdAt", async () => {
    const higherId = persistedDemo("00000000-0000-4000-8000-00000000000b", "2026-09-24T00:00:00.000Z");
    const lowerId = persistedDemo("00000000-0000-4000-8000-000000000001", "2026-09-24T00:00:00.000Z");
    const repository = new FixedWorkflowRepository([higherId, lowerId]);
    const service = new WorkflowService(repository, "https://example.com");

    const result = await seedDemoFromEnv(service, { DEMO_WEBHOOK_URL: FIXTURE_URL });

    expect(result.id).toBe(lowerId.id);
    expect(result.triggerToken).toBe(lowerId.triggerToken);
    expect(await repository.list()).toHaveLength(2);
  });
});

function persistedDemo(id: string, createdAt: string): PersistedWorkflow {
  const triggerToken = id.replaceAll("-", "").slice(0, 32);
  return {
    id,
    name: DEMO_NAME,
    enabled: false,
    triggerToken,
    triggerPath: `/t/${triggerToken}`,
    steps: [],
    createdAt,
    updatedAt: createdAt,
  };
}

class FixedWorkflowRepository implements WorkflowRepository {
  private readonly workflows: PersistedWorkflow[];

  constructor(workflows: PersistedWorkflow[]) {
    this.workflows = workflows.map((workflow) => ({ ...workflow }));
  }

  async list(): Promise<PersistedWorkflow[]> {
    return this.workflows.map((workflow) => ({ ...workflow }));
  }

  async getById(id: string): Promise<PersistedWorkflow | null> {
    return this.workflows.find((workflow) => workflow.id === id) ?? null;
  }

  async getByTriggerToken(triggerToken: string): Promise<PersistedWorkflow | null> {
    return this.workflows.find((workflow) => workflow.triggerToken === triggerToken) ?? null;
  }

  async create(): Promise<PersistedWorkflow> {
    throw new Error("unexpected create");
  }

  async update(): Promise<PersistedWorkflow | null> {
    throw new Error("unexpected update");
  }

  async replace(id: string, put: { name: string; enabled: boolean; steps: WorkflowStep[] }): Promise<PersistedWorkflow | null> {
    const index = this.workflows.findIndex((workflow) => workflow.id === id);
    const existing = this.workflows[index];
    if (existing === undefined) {
      return null;
    }
    const updated: PersistedWorkflow = {
      ...existing,
      name: put.name,
      enabled: put.enabled,
      steps: put.steps,
    };
    this.workflows[index] = updated;
    return updated;
  }

  async deleteById(): Promise<boolean> {
    throw new Error("unexpected delete");
  }
}
