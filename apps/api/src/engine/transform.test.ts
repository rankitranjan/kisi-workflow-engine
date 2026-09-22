import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTransform } from "./transform.js";

describe("applyTransform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies default, template, and pick in order", () => {
    const next = applyTransform(
      {
        type: "transform",
        ops: [
          { op: "default", path: "actor_name", value: "Unknown" },
          { op: "template", to: "title", template: "Event {{type}} by {{actor_name}}" },
          { op: "pick", paths: ["uuid", "type", "success", "severity", "title"] },
        ],
      },
      { uuid: "abc", type: "lock.unlock", success: false, severity: null },
    );

    expect(next).toEqual({
      uuid: "abc",
      type: "lock.unlock",
      success: false,
      severity: null,
      title: "Event lock.unlock by Unknown",
    });
  });

  it("does not replace an existing default value", () => {
    const next = applyTransform(
      {
        type: "transform",
        ops: [{ op: "default", path: "success", value: true }],
      },
      { success: false },
    );
    expect(next).toEqual({ success: false });
  });

  it("fills null and missing paths", () => {
    const next = applyTransform(
      {
        type: "transform",
        ops: [
          { op: "default", path: "success", value: true },
          { op: "default", path: "actor.name", value: "Unknown" },
        ],
      },
      { success: null },
    );
    expect(next).toEqual({ success: true, actor: { name: "Unknown" } });
  });

  it("renders missing template values as empty strings", () => {
    const next = applyTransform(
      {
        type: "transform",
        ops: [{ op: "template", to: "title", template: "Hello {{name}}" }],
      },
      {},
    );
    expect(next).toEqual({ title: "Hello " });
  });

  it("does not mutate the input or perform external side effects", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const actor = { name: "Ada" };
    const input = { type: "lock.unlock", actor };
    const next = applyTransform(
      {
        type: "transform",
        ops: [{ op: "template", to: "title", template: "Event {{type}} by {{actor.name}}" }],
      },
      input,
    );

    expect(next).toEqual({
      type: "lock.unlock",
      actor: { name: "Ada" },
      title: "Event lock.unlock by Ada",
    });
    expect(input).toEqual({ type: "lock.unlock", actor: { name: "Ada" } });
    expect(input.actor).toBe(actor);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
