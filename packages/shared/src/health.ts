import { z } from "zod";
import { API_VERSION, DRIVE_ROOT_FOLDER_NAME } from "./constants.js";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiV1StatusResponseSchema = z.object({
  version: z.literal(API_VERSION),
  driveFolderName: z.literal(DRIVE_ROOT_FOLDER_NAME),
  authMode: z.literal("supabase-jwt"),
});

export type ApiV1StatusResponse = z.infer<typeof ApiV1StatusResponseSchema>;
