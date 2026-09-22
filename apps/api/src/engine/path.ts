import type { JsonObject } from "@kisi-workflow/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value);
}

function assignOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function segmentsOf(path: string): string[] {
  return path.split(".");
}

export function getPath(ctx: JsonObject, path: string): unknown {
  const segments = segmentsOf(path);
  let current: unknown = ctx;
  for (const segment of segments) {
    if (segment.length === 0) {
      return null;
    }
    if (Array.isArray(current)) {
      if (!Object.hasOwn(current, segment)) {
        return null;
      }
      const index = Number(segment);
      if (!Number.isInteger(index) || String(index) !== segment) {
        return null;
      }
      const value: unknown = current[index];
      current = value === undefined ? null : value;
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return null;
    }
    const value = current[segment];
    current = value === undefined ? null : value;
  }
  return current === undefined ? null : current;
}

export function hasPath(ctx: JsonObject, path: string): boolean {
  const segments = segmentsOf(path);
  let current: unknown = ctx;
  for (const segment of segments) {
    if (segment.length === 0) {
      return false;
    }
    if (Array.isArray(current)) {
      if (!Object.hasOwn(current, segment)) {
        return false;
      }
      const index = Number(segment);
      if (!Number.isInteger(index) || String(index) !== segment) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return false;
    }
    current = current[segment];
  }
  return true;
}

export function setPath(ctx: JsonObject, path: string, value: unknown): JsonObject {
  const segments = segmentsOf(path);
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`cannot set path "${path}"`);
  }

  const cloned = structuredClone(ctx);
  let current: JsonObject = cloned;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      throw new Error(`cannot set path "${path}"`);
    }
    const existing = Object.hasOwn(current, segment) ? current[segment] : undefined;
    if (existing === undefined || existing === null) {
      const created: JsonObject = {};
      assignOwn(current, segment, created);
      current = created;
      continue;
    }
    if (!isJsonObject(existing)) {
      throw new Error(`cannot set path "${path}"`);
    }
    current = existing;
  }

  const last = segments[segments.length - 1];
  if (last === undefined) {
    throw new Error(`cannot set path "${path}"`);
  }
  assignOwn(current, last, value);
  return cloned;
}
