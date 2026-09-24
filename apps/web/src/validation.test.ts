import { describe, expect, it } from "vitest";

import { validateCreateForm, validateReplaceForm, validateStepsText } from "./validation";

const filterSteps = [
  {
    type: "filter",
    conditions: [{ path: "success", op: "eq", value: true }],
  },
];

describe("validateStepsText", () => {
  it("accepts an empty steps array", () => {
    expect(validateStepsText("[]")).toEqual({ ok: true, steps: [] });
  });

  it("accepts a filter step", () => {
    expect(validateStepsText(JSON.stringify(filterSteps))).toEqual({
      ok: true,
      steps: filterSteps,
    });
  });

  it("applies shared http_request defaults", () => {
    expect(
      validateStepsText(
        JSON.stringify([
          { type: "http_request", method: "POST", url: "https://example.com/hook" },
        ]),
      ),
    ).toEqual({
      ok: true,
      steps: [
        {
          type: "http_request",
          method: "POST",
          url: "https://example.com/hook",
          timeoutMs: 2000,
          retries: 3,
        },
      ],
    });
  });

  it("rejects invalid JSON", () => {
    expect(validateStepsText("{")).toEqual({
      ok: false,
      message: "Steps must be valid JSON.",
    });
  });

  it("rejects a JSON value that is not a steps array", () => {
    const result = validateStepsText("{}");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).not.toBe("Steps must be valid JSON.");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("rejects an unknown step type", () => {
    const result = validateStepsText(JSON.stringify([{ type: "nope" }]));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("0");
  });
});

describe("validateCreateForm", () => {
  it("returns a WorkflowCreate body with the trimmed name", () => {
    expect(
      validateCreateForm({
        name: "  Unlock alerts  ",
        enabled: false,
        stepsText: "[]",
      }),
    ).toEqual({
      ok: true,
      body: { name: "Unlock alerts", enabled: false, steps: [] },
    });
  });

  it("requires a name", () => {
    const result = validateCreateForm({ name: "   ", enabled: true, stepsText: "[]" });
    expect(result).toEqual({
      ok: false,
      errors: { name: "Enter a name." },
    });
  });

  it("rejects a name longer than 100 characters", () => {
    const result = validateCreateForm({
      name: "n".repeat(101),
      enabled: true,
      stepsText: "[]",
    });
    expect(result).toEqual({
      ok: false,
      errors: { name: "Name must be 100 characters or fewer." },
    });
  });
});

describe("validateReplaceForm", () => {
  it("returns a WorkflowPut body", () => {
    expect(
      validateReplaceForm({
        name: "Unlock alerts",
        enabled: true,
        stepsText: JSON.stringify(filterSteps),
      }),
    ).toEqual({
      ok: true,
      body: { name: "Unlock alerts", enabled: true, steps: filterSteps },
    });
  });

  it("accepts a redacted webhook marker", () => {
    expect(
      validateReplaceForm({
        name: "Unlock alerts",
        enabled: true,
        stepsText: JSON.stringify([
          { type: "http_request", method: "POST", url: { redacted: true } },
        ]),
      }),
    ).toEqual({
      ok: true,
      body: {
        name: "Unlock alerts",
        enabled: true,
        steps: [
          {
            type: "http_request",
            method: "POST",
            url: { redacted: true },
            timeoutMs: 2000,
            retries: 3,
          },
        ],
      },
    });
  });

  it("reports name and steps errors together", () => {
    const result = validateReplaceForm({ name: "", enabled: true, stepsText: "{" });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "Enter a name.",
        steps: "Steps must be valid JSON.",
      },
    });
  });
});
