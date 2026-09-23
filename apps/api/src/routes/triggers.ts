import {
  TriggerBodySchema,
  TriggerResponseSchema,
  TriggerTokenSchema,
  type ZodFlattenedIssues,
} from "@kisi-workflow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { TRIGGER_BODY_LIMIT_BYTES } from "../config.js";
import type { WorkflowRepository } from "../db/workflow-repository.js";
import type { WorkflowRunRepository } from "../db/workflow-run-repository.js";
import { executeWorkflow } from "../engine/runner.js";
import { sendApiError } from "../http/errors.js";
import type { DnsResolver } from "../security/ssrf.js";

const TriggerParamsSchema = z.strictObject({
  triggerToken: TriggerTokenSchema,
});

function validationDetails(error: z.ZodError): ZodFlattenedIssues {
  const flattened = error.flatten();
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages)) {
      fieldErrors[key] = messages.filter((message): message is string => typeof message === "string");
    }
  }
  return {
    formErrors: flattened.formErrors,
    fieldErrors,
  };
}

export type TriggerRouteOptions = {
  repository: WorkflowRepository;
  runRepository: WorkflowRunRepository;
  allowPrivateUrls: boolean;
  fetchImpl?: typeof fetch;
  resolve?: DnsResolver;
};

export const triggerRoutes: FastifyPluginAsync<TriggerRouteOptions> = async (app, opts) => {
  app.post(
    "/:triggerToken",
    { bodyLimit: TRIGGER_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const params = TriggerParamsSchema.safeParse(request.params);
      if (!params.success) {
        return sendApiError(reply, {
          error: "validation_error",
          details: validationDetails(params.error),
        });
      }

      const workflow = await opts.repository.getByTriggerToken(params.data.triggerToken);
      if (!workflow) {
        return sendApiError(reply, { error: "not_found" });
      }
      if (!workflow.enabled) {
        return sendApiError(reply, { error: "workflow_disabled" });
      }

      const body = TriggerBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendApiError(reply, {
          error: "validation_error",
          details: validationDetails(body.error),
        });
      }

      const run = await executeWorkflow(
        {
          workflowId: workflow.id,
          steps: workflow.steps,
          requestBody: body.data,
        },
        {
          runRepository: opts.runRepository,
          allowPrivateUrls: opts.allowPrivateUrls,
          fetchImpl: opts.fetchImpl,
          resolve: opts.resolve,
        },
      );

      return TriggerResponseSchema.parse({
        status: run.status,
        runId: run.id,
        workflowId: run.workflowId,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        error: run.error,
      });
    },
  );
};
