import { TriggerTokenSchema } from "@kisi-workflow/shared";
import { describe, expect, it } from "vitest";

import { generateTriggerToken, triggerPathFor } from "./trigger-token.js";

describe("generateTriggerToken", () => {
  it("returns 32 lowercase hex characters", () => {
    const token = generateTriggerToken();
    expect(TriggerTokenSchema.safeParse(token).success).toBe(true);
  });

  it("returns a different value on a subsequent call", () => {
    expect(generateTriggerToken()).not.toBe(generateTriggerToken());
  });
});

describe("triggerPathFor", () => {
  it("prefixes the token with /t/", () => {
    const token = "4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e";
    expect(triggerPathFor(token)).toBe(`/t/${token}`);
  });
});
