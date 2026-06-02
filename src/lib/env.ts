import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string"
    ),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  TELEGRAM_ALLOWED_CHAT_IDS: z.string().min(1).optional(),
  TELEGRAM_CHAT_OWNERSHIP_MAP: z.string().min(1).optional(),
  TELEGRAM_ACTOR_EMAIL: z.string().email().optional(),
  PLUGGY_CLIENT_ID: z.string().min(1).optional(),
  PLUGGY_CLIENT_SECRET: z.string().min(1).optional(),
  PLUGGY_ENV: z.enum(["sandbox", "production", "development"]).optional(),
  PLUGGY_BASE_URL: z.string().url().optional(),
  PLUGGY_ITEM_IDS: z.string().min(1).optional(),
  PLUGGY_TRANSACTIONS_FROM: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  PLUGGY_WEBHOOK_SECRET: z.string().min(16).optional(),
});

const parsedEnv = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NODE_ENV: process.env.NODE_ENV,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_ALLOWED_CHAT_IDS: process.env.TELEGRAM_ALLOWED_CHAT_IDS,
  TELEGRAM_CHAT_OWNERSHIP_MAP: process.env.TELEGRAM_CHAT_OWNERSHIP_MAP,
  TELEGRAM_ACTOR_EMAIL: process.env.TELEGRAM_ACTOR_EMAIL,
  PLUGGY_CLIENT_ID: process.env.PLUGGY_CLIENT_ID,
  PLUGGY_CLIENT_SECRET: process.env.PLUGGY_CLIENT_SECRET,
  PLUGGY_ENV: process.env.PLUGGY_ENV,
  PLUGGY_BASE_URL: process.env.PLUGGY_BASE_URL,
  PLUGGY_ITEM_IDS: process.env.PLUGGY_ITEM_IDS,
  PLUGGY_TRANSACTIONS_FROM: process.env.PLUGGY_TRANSACTIONS_FROM,
  PLUGGY_WEBHOOK_SECRET: process.env.PLUGGY_WEBHOOK_SECRET,
});

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnv.data;
