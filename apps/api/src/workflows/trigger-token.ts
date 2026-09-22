import { randomBytes } from "node:crypto";

import { TRIGGER_TOKEN_LENGTH } from "@kisi-workflow/shared";

export function generateTriggerToken(): string {
  return randomBytes(TRIGGER_TOKEN_LENGTH / 2).toString("hex");
}

export function triggerPathFor(token: string): string {
  return `/t/${token}`;
}

export function triggerUrlFor(publicUrl: string, triggerPath: string): string {
  return `${publicUrl.replace(/\/+$/, "")}${triggerPath}`;
}
