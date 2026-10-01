import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: "../../.env" });

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
    seed: "tsx seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});