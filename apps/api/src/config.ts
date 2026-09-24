import { z } from "zod";

export const CRUD_BODY_LIMIT_BYTES = 256 * 1024;
export const TRIGGER_BODY_LIMIT_BYTES = 64 * 1024;
export const DEFAULT_PORT = 3000;

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.httpUrl(),
  DEMO_ACCESS_KEY: z.string().min(1),
  PORT: z.string().optional(),
  ALLOW_PRIVATE_URLS: z.enum(["true", "false"]).optional(),
  DEMO_WEBHOOK_URL: z.string().optional(),
});

export type HttpConfig = {
  publicUrl: string;
  demoAccessKey: string;
  bodyLimitBytes: number;
  allowPrivateUrls: boolean;
  demoWebhookUrl?: string;
};

export type AppConfig = HttpConfig & {
  databaseUrl: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const port = parsed.PORT === undefined ? DEFAULT_PORT : Number(parsed.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    databaseUrl: parsed.DATABASE_URL,
    publicUrl: parsed.PUBLIC_URL,
    demoAccessKey: parsed.DEMO_ACCESS_KEY,
    bodyLimitBytes: CRUD_BODY_LIMIT_BYTES,
    allowPrivateUrls: parsed.ALLOW_PRIVATE_URLS === "true",
    demoWebhookUrl: readDemoWebhookUrl(parsed.DEMO_WEBHOOK_URL),
    port,
  };
}

function readDemoWebhookUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
