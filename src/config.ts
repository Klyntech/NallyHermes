import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  NVIDIA_NIM_API_KEY: z.string().min(1),
  NVIDIA_NIM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_NIM_MODEL: z.string().default("meta/llama-3.3-70b-instruct"),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info")
});

export const config = envSchema.parse(process.env);
