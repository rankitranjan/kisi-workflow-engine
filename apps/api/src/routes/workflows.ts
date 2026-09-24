import {
  WorkflowCreateSchema,
  WorkflowPatchSchema,
  WorkflowPutSchema,
} from "@kisi-workflow/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sendApiError } from "../http/errors.js";
import type { WorkflowService } from "../workflows/service.js";

const WorkflowIdParamsSchema = z.strictObject({
  id: z.uuid(),
});

export const workflowRoutes: FastifyPluginAsync<{ service: WorkflowService }> = async (
  app,
  opts,
) => {
  const { service } = opts;

  app.get("/", async () => {
    const workflows = await service.list();
    return workflows.map((workflow) => service.toListItem(workflow));
  });

  app.post("/", async (request, reply) => {
    const parsed = WorkflowCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }
    const created = await service.create(parsed.data);
    return reply.status(201).send(service.toDetail(created));
  });

  app.get("/:id", async (request, reply) => {
    const params = WorkflowIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: params.error.flatten(),
      });
    }
    return service.toDetail(await service.getById(params.data.id));
  });

  app.patch("/:id", async (request, reply) => {
    const params = WorkflowIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: params.error.flatten(),
      });
    }
    const parsed = WorkflowPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }
    return service.toDetail(await service.patch(params.data.id, parsed.data));
  });

  app.put("/:id", async (request, reply) => {
    const params = WorkflowIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: params.error.flatten(),
      });
    }
    const parsed = WorkflowPutSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }
    return service.toDetail(await service.put(params.data.id, parsed.data));
  });

  app.delete("/:id", async (request, reply) => {
    const params = WorkflowIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, {
        error: "validation_error",
        details: params.error.flatten(),
      });
    }
    await service.delete(params.data.id);
    return reply.status(204).send();
  });
};
