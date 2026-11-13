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
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FILE_WORKSPACE: z.string().min(1).default("./workspace"),
  LIGHTRAG_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LIGHTRAG_URL: z.string().url().default("http://127.0.0.1:9621"),
  LIGHTRAG_API_TOKEN: z.string().optional(),
  LIGHTRAG_LLM_MODEL: z.string().optional(),
  LIGHTRAG_EMBEDDING_MODEL: z.string().default("nvidia/nemotron-3-embed-1b"),
  LIGHTRAG_EMBEDDING_DIM: z.coerce.number().int().min(1).max(8192).default(2048),
  LIGHTRAG_WORKING_DIR: z.string().min(1).default("./lightrag_data"),
  LIGHTRAG_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(1_800_000).default(1_800_000),
  GOOGLE_CALENDAR_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  GOOGLE_CALENDAR_TELEGRAM_IDS: z.string().default(""),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_ALLOW_ALL_REPOS: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  GITHUB_ALLOWED_REPOS: z.string().default(""),
  GITHUB_ALLOW_WRITES: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GITHUB_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  NOTION_TOKEN: z.string().optional(),
  NOTION_ALLOW_WRITES: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  NOTION_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_ALLOW_WRITES: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GMAIL_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  NALLPUTER_URL: z.string().url().optional(),
  NALLPUTER_TOKEN: z.string().optional(),
  NALLPUTER_ALLOW_WRITES: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  NALLPUTER_ALLOW_COMMANDS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  NALLPUTER_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  INGESTION_MAX_UPLOAD_BYTES: z.coerce.number().int().min(1_000_000).max(25_000_000).default(20_000_000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AGENT_MAX_MODEL_ROUNDS: z.coerce.number().int().min(1).max(100).default(12),
  AGENT_MAX_PLAN_TOOL_ROUNDS: z.coerce.number().int().min(1).max(500).default(60),
  AGENT_MAX_STEP_TOOL_ROUNDS: z.coerce.number().int().min(1).max(100).default(15),
  AGENT_MAX_PARALLEL_PLAN_STEPS: z.coerce.number().int().min(1).max(20).default(5),
  AGENT_MAX_PARALLEL_TOOL_CALLS: z.coerce.number().int().min(1).max(20).default(5),
  AGENT_PLAN_TIMEOUT_MS: z.coerce.number().int().min(30000).max(1800000).default(480000),
  AGENT_MODEL_TIMEOUT_MS: z.coerce.number().int().min(10000).max(300000).default(120000),
  AGENT_MAX_READ_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  // Voice (Deepgram STT + ElevenLabs TTS). Disabled unless VOICE_ENABLED=true.
  VOICE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().default("nova-2"),
  DEEPGRAM_LANGUAGE: z.string().default("en"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),
  VOICE_STT_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
  VOICE_TTS_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(60_000),
  VOICE_PROVIDER_RETRIES: z.coerce.number().int().min(0).max(4).default(2),
  VOICE_TTS_MAX_CHARS: z.coerce.number().int().min(200).max(5_000).default(900),
  VOICE_MAX_AUDIO_BYTES: z.coerce.number().int().min(10_000).max(20_000_000).default(4_000_000),
  VOICE_MAX_DURATION_SEC: z.coerce.number().int().min(1).max(900).default(180),
  VOICE_AUDIO_PROCESS_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  /** Speaking rate for ElevenLabs (1.0 = normal). Default 0.9 = 10% slower. */
  VOICE_SPEECH_SPEED: z.coerce.number().min(0.7).max(1.2).default(0.9),
  VOICE_STABILITY: z.coerce.number().min(0).max(1).default(0.45),
  VOICE_SIMILARITY_BOOST: z.coerce.number().min(0).max(1).default(0.8),
  VOICE_STYLE: z.coerce.number().min(0).max(1).default(0.35)
}).superRefine((env, context) => {
  if (new URL(env.WEBHOOK_URL).protocol !== "https:") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEBHOOK_URL"],
      message: "WEBHOOK_URL must use HTTPS because Telegram webhooks require a secure public endpoint."
    });
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: env.DEFAULT_TIMEZONE });
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DEFAULT_TIMEZONE"],
      message: "DEFAULT_TIMEZONE must be a valid IANA timezone."
    });
  }

  if (env.LIGHTRAG_ENABLED) {
    if (!env.LIGHTRAG_API_TOKEN || env.LIGHTRAG_API_TOKEN.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LIGHTRAG_API_TOKEN"],
        message: "LIGHTRAG_API_TOKEN must contain at least 32 characters when LightRAG is enabled."
      });
    }
    if (!env.LIGHTRAG_LLM_MODEL?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LIGHTRAG_LLM_MODEL"],
        message: "LIGHTRAG_LLM_MODEL is required when LightRAG is enabled."
      });
    }
  }

  if (env.VOICE_ENABLED) {
    if (!env.DEEPGRAM_API_KEY?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEEPGRAM_API_KEY"],
        message: "DEEPGRAM_API_KEY is required when VOICE_ENABLED is true."
      });
    }
    if (!env.ELEVENLABS_API_KEY?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ELEVENLABS_API_KEY"],
        message: "ELEVENLABS_API_KEY is required when VOICE_ENABLED is true."
      });
    }
    if (!env.ELEVENLABS_VOICE_ID?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ELEVENLABS_VOICE_ID"],
        message: "ELEVENLABS_VOICE_ID is required when VOICE_ENABLED is true."
      });
    }
  }
});

export const config = envSchema.parse(process.env);
