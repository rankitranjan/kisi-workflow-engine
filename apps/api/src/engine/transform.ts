import type { JsonObject, TransformStep } from "@kisi-workflow/shared";

import { getPath, setPath } from "./path.js";
import { interpolate, type TemplateBindings } from "./template.js";

export function applyTransform(
  step: TransformStep,
  ctx: JsonObject,
  bindings?: TemplateBindings,
): JsonObject {
  let current = ctx;
  for (const op of step.ops) {
    if (op.op === "default") {
      if (getPath(current, op.path) === null) {
        current = setPath(current, op.path, op.value);
      }
      continue;
    }
    if (op.op === "template") {
      current = setPath(current, op.to, interpolate(op.template, current, bindings));
      continue;
    }
    if (op.op === "pick") {
      let picked: JsonObject = {};
      for (const path of op.paths) {
        picked = setPath(picked, path, getPath(current, path));
      }
      current = picked;
      continue;
    }
    const unexpected: never = op;
    throw new Error(`unknown transform op: ${JSON.stringify(unexpected)}`);
  }
  return current;
}
