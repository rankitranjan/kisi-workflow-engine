import { describe, expect, it } from "vitest";

import { statusCodeForApiError } from "./errors.js";

describe("statusCodeForApiError", () => {
  it("maps validation_error to 400", () => {
    expect(
      statusCodeForApiError({
        error: "validation_error",
        details: { formErrors: [], fieldErrors: {} },
      }),
    ).toBe(400);
  });

  it("maps unauthorized to 401", () => {
    expect(statusCodeForApiError({ error: "unauthorized" })).toBe(401);
  });

  it("maps workflow_disabled to 403", () => {
    expect(statusCodeForApiError({ error: "workflow_disabled" })).toBe(403);
  });

  it("maps not_found to 404", () => {
    expect(statusCodeForApiError({ error: "not_found" })).toBe(404);
  });

  it("maps payload_too_large to 413", () => {
    expect(statusCodeForApiError({ error: "payload_too_large" })).toBe(413);
  });

  it("maps internal_error to 500", () => {
    expect(statusCodeForApiError({ error: "internal_error" })).toBe(500);
  });
});
