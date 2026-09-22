import { describe, expect, it } from "vitest";

import { interpolate } from "./template.js";

describe("interpolate", () => {
  it("replaces a missing placeholder with an empty string", () => {
    expect(interpolate("Hello {{name}}", {})).toBe("Hello ");
    expect(interpolate("{{a}}-{{b}}", { a: "1" })).toBe("1-");
  });

  it("reads nested dot-paths and trims placeholder whitespace", () => {
    expect(interpolate("Event {{ type }} by {{actor.name}}", { type: "lock.unlock", actor: { name: "Ada" } })).toBe(
      "Event lock.unlock by Ada",
    );
  });

  it("stringifies numbers, booleans, and objects", () => {
    expect(interpolate("{{count}} {{ok}} {{meta}}", { count: 3, ok: false, meta: { a: 1 } })).toBe(
      '3 false {"a":1}',
    );
  });

  it("renders an explicit null as an empty string", () => {
    expect(interpolate("{{name}}", { name: null })).toBe("");
  });

  it("uses workflow_id and run_id bindings when those paths are absent", () => {
    expect(interpolate("{{workflow_id}}/{{run_id}}", {}, { workflow_id: "wf", run_id: "run" })).toBe("wf/run");
  });

  it("prefers a context value over a reserved binding", () => {
    expect(interpolate("{{workflow_id}}", { workflow_id: "from-ctx" }, { workflow_id: "from-binding" })).toBe(
      "from-ctx",
    );
  });
});
