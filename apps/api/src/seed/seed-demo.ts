import { prisma } from "../db/prisma.js";
import { PrismaWorkflowRepository } from "../db/prisma-workflow-repository.js";
import { WorkflowService } from "../workflows/service.js";
import { DemoWebhookUrlError, seedDemoFromEnv } from "./demo-workflow.js";

const publicUrl = process.env.PUBLIC_URL;
const service = new WorkflowService(
  new PrismaWorkflowRepository(prisma),
  publicUrl !== undefined && publicUrl.length > 0 ? publicUrl : "http://localhost",
);

try {
  const result = await seedDemoFromEnv(service, process.env);
  console.log(`${result.action} ${result.triggerPath}`);
} catch (error) {
  const message = error instanceof DemoWebhookUrlError ? error.message : "seed failed";
  console.error(message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
