import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { expect, test as base } from "@playwright/test";

export type CapturedRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
};

export type MockWebhook = {
  url: string;
  requests: CapturedRequest[];
  clear: () => void;
  close: () => Promise<void>;
};

function headerRecord(headers: IncomingMessage["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function parsedBody(raw: string): unknown {
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function handle(request: IncomingMessage, response: ServerResponse, requests: CapturedRequest[]): Promise<void> {
  const raw = await readBody(request);
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  requests.push({
    method: request.method ?? "",
    path: url.pathname,
    headers: headerRecord(request.headers),
    body: parsedBody(raw),
  });
  response.setHeader("Connection", "close");
  if (request.method === "POST" && url.pathname === "/hook") {
    response.writeHead(204);
    response.end();
    return;
  }
  response.writeHead(404);
  response.end();
}

export function startMockWebhook(): Promise<MockWebhook> {
  const requests: CapturedRequest[] = [];
  const server = createServer((request, response) => {
    void handle(request, response, requests).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500);
      }
      response.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("mock webhook did not bind a port"));
        return;
      }
      const webhook: MockWebhook = {
        url: `http://127.0.0.1:${address.port}/hook`,
        requests,
        clear: () => {
          requests.length = 0;
        },
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
            server.closeAllConnections();
          }),
      };
      resolve(webhook);
    });
  });
}

type WebhookFixtures = {
  webhook: MockWebhook;
};

export const test = base.extend<WebhookFixtures>({
  webhook: async ({}, use) => {
    const webhook = await startMockWebhook();
    try {
      await use(webhook);
    } finally {
      await webhook.close();
    }
  },
});

export { expect };
