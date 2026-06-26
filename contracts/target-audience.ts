import { z } from "zod";

export const TARGET_AUDIENCE_VALUES = ["bambino", "adulto"] as const;

export const targetAudienceSchema = z.enum(TARGET_AUDIENCE_VALUES);

export type TargetAudience = z.infer<typeof targetAudienceSchema>;

export const DEFAULT_TARGET_AUDIENCE: TargetAudience = "bambino";

export function isTargetAudience(value: unknown): value is TargetAudience {
  return targetAudienceSchema.safeParse(value).success;
}
