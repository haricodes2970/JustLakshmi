import { z } from "zod";

const originUrlSchema = z
  .string()
  .trim()
  .refine((val) => val !== "*", { error: "Wildcard CORS origin (*) is forbidden." })
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === val;
      } catch {
        return false;
      }
    },
    { error: "Each CORS origin must be an exact http(s) origin without trailing slash or path." },
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .min(1, "CORS_ORIGINS is required (comma-separated explicit origins).")
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(originUrlSchema).min(1, "At least one valid CORS origin is required.")),
  SUPABASE_URL: z.url({ error: "SUPABASE_URL must be a valid URL." }),
  SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "SUPABASE_PUBLISHABLE_KEY is required.")
    .refine((val) => !val.startsWith("sb_secret_"), {
      error: "Do not pass a Supabase secret/service_role key as SUPABASE_PUBLISHABLE_KEY.",
    }),
});

export type ApiEnv = z.infer<typeof EnvSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): ApiEnv {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.map(String).join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
