import { describe, expect, it } from "vitest";

import { filterMatches } from "./filter.js";

const andStep = {
  type: "filter" as const,
  conditions: [
    { path: "type", op: "eq" as const, value: "lock.unlock" },
    { path: "success", op: "neq" as const, value: true },
  ],
};

describe("filterMatches", () => {
  it("passes when every condition matches", () => {
    expect(filterMatches(andStep, { type: "lock.unlock", success: false })).toBe(true);
  });

  it("fails when one AND condition does not match", () => {
    expect(filterMatches(andStep, { type: "lock.unlock", success: true })).toBe(false);
    expect(filterMatches(andStep, { type: "lock.lock", success: false })).toBe(false);
  });

  it("compares a missing path as null", () => {
    expect(
      filterMatches(
        { type: "filter", conditions: [{ path: "actor", op: "eq", value: null }] },
        {},
      ),
    ).toBe(true);
    expect(
      filterMatches(
        { type: "filter", conditions: [{ path: "actor", op: "eq", value: "Ada" }] },
        {},
      ),
    ).toBe(false);
  });

  it("deep-equals object values", () => {
    expect(
      filterMatches(
        { type: "filter", conditions: [{ path: "meta", op: "eq", value: { b: 1, a: 2 } }] },
        { meta: { a: 2, b: 1 } },
      ),
    ).toBe(true);
  });

  it("does not mutate the context", () => {
    const nested = { ok: true };
    const ctx = { type: "lock.unlock", success: false, nested };
    expect(filterMatches(andStep, ctx)).toBe(true);
    expect(ctx).toEqual({ type: "lock.unlock", success: false, nested });
    expect(ctx.nested).toBe(nested);
  });
});
