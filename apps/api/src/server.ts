import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { prisma } from "./db/prisma.js";
import { PrismaWorkflowRepository } from "./db/prisma-workflow-repository.js";
import { PrismaWorkflowRunRepository } from "./db/prisma-workflow-run-repository.js";

const config = loadConfig();
const app = await buildApp({
  repository: new PrismaWorkflowRepository(prisma),
  runRepository: new PrismaWorkflowRunRepository(prisma),
  config: {
    publicUrl: config.publicUrl,
    corsOrigin: config.corsOrigin,
    demoAccessKey: config.demoAccessKey,
    bodyLimitBytes: config.bodyLimitBytes,
      allowPrivateUrls: config.allowPrivateUrls,
      demoWebhookUrl: config.demoWebhookUrl,
    },
  logger: true,
});

await app.listen({ port: config.port, host: "0.0.0.0" });
