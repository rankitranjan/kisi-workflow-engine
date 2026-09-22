import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { prisma } from "./db/prisma.js";
import { PrismaWorkflowRepository } from "./db/prisma-workflow-repository.js";

const config = loadConfig();
const app = await buildApp({
  repository: new PrismaWorkflowRepository(prisma),
  config: {
    publicUrl: config.publicUrl,
    demoAccessKey: config.demoAccessKey,
    bodyLimitBytes: config.bodyLimitBytes,
  },
  logger: true,
});

await app.listen({ port: config.port, host: "0.0.0.0" });
