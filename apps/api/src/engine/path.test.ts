import { describe, expect, it } from "vitest";

import { getPath, setPath } from "./path.js";

describe("getPath", () => {
  it("reads nested dot-paths", () => {
    expect(getPath({ actor: { name: "Ada" }, items: ["a"] }, "actor.name")).toBe("Ada");
    expect(getPath({ items: ["a", "b"] }, "items.0")).toBe("a");
  });

  it("returns null when a path is missing", () => {
    expect(getPath({}, "missing")).toBeNull();
    expect(getPath({ actor: { name: "Ada" } }, "actor.id")).toBeNull();
    expect(getPath({ actor: null }, "actor.name")).toBeNull();
  });

  it("returns null for an explicit null value", () => {
    expect(getPath({ actor: null }, "actor")).toBeNull();
  });

  it("does not read inherited properties", () => {
    expect(getPath({}, "constructor")).toBeNull();
    expect(getPath({}, "toString")).toBeNull();
  });
});

describe("setPath", () => {
  it("writes a nested path without mutating the input", () => {
    const input = { type: "lock.unlock" };
    const next = setPath(input, "actor.name", "Ada");
    expect(next).toEqual({ type: "lock.unlock", actor: { name: "Ada" } });
    expect(input).toEqual({ type: "lock.unlock" });
  });

  it("rejects a path through a primitive value", () => {
    expect(() => setPath({ actor: "Ada" }, "actor.name", "x")).toThrow(/cannot set path/);
  });

  it("stores __proto__ as an own property", () => {
    const next = setPath({}, "__proto__", { polluted: true });
    expect(Object.hasOwn(next, "__proto__")).toBe(true);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
