import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: z.string().min(12).max(128),
});

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});