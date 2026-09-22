import type { FastifyReply, FastifyRequest } from "fastify";

import { sendApiError } from "../http/errors.js";

export function isWorkflowsPath(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path === "/workflows" || path.startsWith("/workflows/");
}

export function createDemoAccessHook(demoAccessKey: string) {
  return async function demoAccessHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!isWorkflowsPath(request.url)) {
      return;
    }

    const header = request.headers["x-demo-key"];
    const provided = Array.isArray(header) ? header[0] : header;
    if (provided !== demoAccessKey) {
      sendApiError(reply, { error: "unauthorized" });
      return;
    }
  };
}
