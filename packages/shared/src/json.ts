import { z } from "zod";

/** JSON object (not array/primitive). Used for trigger ctx and custom HTTP bodies. */
export const JsonObjectSchema = z.record(z.string(), z.json());

export type JsonObject = z.infer<typeof JsonObjectSchema>;
