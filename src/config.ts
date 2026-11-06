import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  NVIDIA_NIM_API_KEY: z.string().min(1),
  NVIDIA_NIM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_NIM_MODEL: z.string().default("nvidia/nemotron-3.5-super-vl-120b-a12b"),
  DATABASE_URL: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().default("Africa/Lagos"),
  TAVILY_API_KEY: z.string().optional(),
  WEBHOOK_URL: z.string().url(),
  WEBHOOK_SECRET: z.string().min(32).regex(/^[A-Za-z0-9_-]+$/),
  PORT: z.coerce.number().int().positive().default(3000),
  FILE_WORKSPACE: z.string().min(1).default("./workspace"),
  LIGHTRAG_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LIGHTRAG_URL: z.string().url().default("http://127.0.0.1:9621"),
  LIGHTRAG_API_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  AGENT_MAX_MODEL_ROUNDS: z.coerce.number().int().min(1).max(100).default(12),
  AGENT_MAX_PLAN_TOOL_ROUNDS: z.coerce.number().int().min(1).max(500).default(60),
  AGENT_MAX_STEP_TOOL_ROUNDS: z.coerce.number().int().min(1).max(100).default(15),
  AGENT_MAX_PARALLEL_PLAN_STEPS: z.coerce.number().int().min(1).max(20).default(5),
  AGENT_MAX_PARALLEL_TOOL_CALLS: z.coerce.number().int().min(1).max(20).default(5),
  AGENT_PLAN_TIMEOUT_MS: z.coerce.number().int().min(30000).max(1800000).default(480000)
});

export const config = envSchema.parse(process.env);
