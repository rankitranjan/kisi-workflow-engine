import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { createDemoAccessHook } from "./auth/demo-access.js";
import type { HttpConfig } from "./config.js";
import type { WorkflowRepository } from "./db/workflow-repository.js";
import type { WorkflowRunRepository } from "./db/workflow-run-repository.js";
import { sendApiError } from "./http/errors.js";
import { triggerRoutes } from "./routes/triggers.js";
import { workflowRoutes } from "./routes/workflows.js";
import type { DnsResolver } from "./security/ssrf.js";
import {
  UnresolvedRedactedWebhookError,
  WorkflowNotFoundError,
  WorkflowService,
} from "./workflows/service.js";
import { generateTriggerToken } from "./workflows/trigger-token.js";

export type BuildAppOptions = {
  repository: WorkflowRepository;
  runRepository: WorkflowRunRepository;
  config: HttpConfig;
  generateTriggerToken?: () => string;
  fetchImpl?: typeof fetch;
  resolve?: DnsResolver;
  logger?: boolean;
};

function isHttpError(error: unknown): error is Error & { statusCode?: number; code?: string } {
  return error instanceof Error;
}

function isBodyTooLarge(error: { statusCode?: number; code?: string }): boolean {
  return error.statusCode === 413 || error.code === "FST_ERR_CTP_BODY_TOO_LARGE";
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.config.bodyLimitBytes,
  });

  await app.register(cors, {
    origin: options.config.corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-demo-key", "accept"],
  });
  const service = new WorkflowService(
    options.repository,
    options.config.publicUrl,
    options.generateTriggerToken ?? generateTriggerToken,
    options.config.demoWebhookUrl,
  );

  app.addHook("onRequest", createDemoAccessHook(options.config.demoAccessKey));

  app.setNotFoundHandler((_request, reply) => {
    return sendApiError(reply, { error: "not_found" });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkflowNotFoundError) {
      return sendApiError(reply, { error: "not_found" });
    }
    if (error instanceof UnresolvedRedactedWebhookError) {
      return sendApiError(reply, {
        error: "validation_error",
        details: {
          formErrors: ["A redacted webhook URL cannot be saved."],
          fieldErrors: {},
        },
      });
    }
    if (isHttpError(error) && isBodyTooLarge(error)) {
      return sendApiError(reply, { error: "payload_too_large" });
    }
    if (isHttpError(error) && error.statusCode === 400) {
      return sendApiError(reply, {
        error: "validation_error",
        details: {
          formErrors: [error.message],
          fieldErrors: {},
        },
      });
    }

    app.log.error(error);
    return sendApiError(reply, { error: "internal_error" });
  });

  await app.register(workflowRoutes, { prefix: "/workflows", service });
  await app.register(triggerRoutes, {
    prefix: "/t",
    repository: options.repository,
    runRepository: options.runRepository,
    allowPrivateUrls: options.config.allowPrivateUrls,
    fetchImpl: options.fetchImpl,
    resolve: options.resolve,
  });
  return app;
}
