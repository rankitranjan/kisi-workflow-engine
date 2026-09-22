import type { FilterStep, JsonObject } from "@kisi-workflow/shared";

import { getPath } from "./path.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null || left === undefined || right === undefined) {
    return false;
  }
  if (typeof left !== typeof right) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]));
}

export function filterMatches(step: FilterStep, ctx: JsonObject): boolean {
  return step.conditions.every((condition) => {
    const actual = getPath(ctx, condition.path);
    const equal = jsonEqual(actual, condition.value);
    return condition.op === "eq" ? equal : !equal;
  });
}
