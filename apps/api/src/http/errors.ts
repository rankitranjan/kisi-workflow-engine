import type { ApiError } from "@kisi-workflow/shared";
import type { FastifyReply } from "fastify";

export function statusCodeForApiError(error: ApiError): number {
  switch (error.error) {
    case "validation_error":
      return 400;
    case "unauthorized":
      return 401;
    case "workflow_disabled":
      return 403;
    case "not_found":
      return 404;
    case "payload_too_large":
      return 413;
    case "internal_error":
      return 500;
  }
}

export function sendApiError(reply: FastifyReply, error: ApiError): FastifyReply {
  return reply.status(statusCodeForApiError(error)).send(error);
}
