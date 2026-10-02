import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
  JWT_SECRET: z.string().min(32),
  FRONTEND_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol)
        && url.pathname === "/"
        && !url.search
        && !url.hash
        && !url.username
        && !url.password;
    })
    .optional(),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  frontendUrl?: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const invalidVariables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid environment configuration: ${invalidVariables.join(", ")}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    jwtSecret: result.data.JWT_SECRET,
    frontendUrl: result.data.FRONTEND_URL
      ? new URL(result.data.FRONTEND_URL).origin
      : undefined,
  };
}