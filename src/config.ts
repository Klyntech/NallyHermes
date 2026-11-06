import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  NVIDIA_NIM_API_KEY: z.string().min(1),
  NVIDIA_NIM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_NIM_MODEL: z.string().default("nvidia/nemotron-3.5-super-vl-120b-a12b"),
  DATABASE_URL: z.string().min(1),
  TAVILY_API_KEY: z.string().optional(),
  WEBHOOK_URL: z.string().url(),
  WEBHOOK_SECRET: z.string().min(32).regex(/^[A-Za-z0-9_-]+$/),
  PORT: z.coerce.number().int().positive().default(3000),
  FILE_WORKSPACE: z.string().min(1).default("./workspace"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info")
});

export const config = envSchema.parse(process.env);
