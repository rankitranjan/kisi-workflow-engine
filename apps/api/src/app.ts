import Fastify, { type FastifyInstance } from "fastify";

import { createDemoAccessHook } from "./auth/demo-access.js";
import type { HttpConfig } from "./config.js";
import type { WorkflowRepository } from "./db/workflow-repository.js";
import { sendApiError } from "./http/errors.js";
import { workflowRoutes } from "./routes/workflows.js";
import { WorkflowNotFoundError, WorkflowService } from "./workflows/service.js";
import { generateTriggerToken } from "./workflows/trigger-token.js";

export type BuildAppOptions = {
  repository: WorkflowRepository;
  config: HttpConfig;
  generateTriggerToken?: () => string;
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

  const service = new WorkflowService(
    options.repository,
    options.config.publicUrl,
    options.generateTriggerToken ?? generateTriggerToken,
  );

  app.addHook("onRequest", createDemoAccessHook(options.config.demoAccessKey));

  app.setNotFoundHandler((_request, reply) => {
    return sendApiError(reply, { error: "not_found" });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkflowNotFoundError) {
      return sendApiError(reply, { error: "not_found" });
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
  return app;
}
