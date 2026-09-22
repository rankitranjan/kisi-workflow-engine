import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PrismaWorkflowRepository } from "./prisma-workflow-repository.js";

const workflowId = "22222222-2222-4222-8222-222222222222";
const triggerToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const createdAt = new Date("2026-09-23T00:00:00.000Z");

const row = {
  id: workflowId,
  name: "Unlock alerts",
  enabled: true,
  triggerToken,
  triggerPath: `/t/${triggerToken}`,
  steps: [],
  createdAt,
  updatedAt: createdAt,
};

describe("PrismaWorkflowRepository.getByTriggerToken", () => {
  it("loads a workflow by the unique trigger token", async () => {
    const queries: unknown[] = [];
    const prisma = {
      workflow: {
        findUnique: async (query: unknown) => {
          queries.push(query);
          return row;
        },
      },
    } as unknown as PrismaClient;

    const workflow = await new PrismaWorkflowRepository(prisma).getByTriggerToken(triggerToken);

    expect(queries).toEqual([{ where: { triggerToken } }]);
    expect(workflow).toEqual({
      id: workflowId,
      name: "Unlock alerts",
      enabled: true,
      triggerToken,
      triggerPath: `/t/${triggerToken}`,
      steps: [],
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
  });

  it("returns null when the token is missing", async () => {
    const prisma = {
      workflow: {
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;

    const workflow = await new PrismaWorkflowRepository(prisma).getByTriggerToken(triggerToken);
    expect(workflow).toBeNull();
  });
});
