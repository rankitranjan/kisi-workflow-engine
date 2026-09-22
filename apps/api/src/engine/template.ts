import type { JsonObject } from "@kisi-workflow/shared";

import { getPath, hasPath } from "./path.js";

export type TemplateBindings = {
  workflow_id?: string;
  run_id?: string;
};

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function interpolate(template: string, ctx: JsonObject, bindings: TemplateBindings = {}): string {
  const placeholder = /\{\{\s*([^{}]+?)\s*\}\}/g;
  return template.replace(placeholder, (_match: string, rawPath: string) => {
    const path = rawPath.trim();
    if (!hasPath(ctx, path)) {
      if (path === "workflow_id" && bindings.workflow_id !== undefined) {
        return bindings.workflow_id;
      }
      if (path === "run_id" && bindings.run_id !== undefined) {
        return bindings.run_id;
      }
      return "";
    }
    return stringifyValue(getPath(ctx, path));
  });
}
