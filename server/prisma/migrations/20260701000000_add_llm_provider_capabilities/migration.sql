ALTER TABLE "LlmProvider"
ADD COLUMN "protocol" TEXT NOT NULL DEFAULT 'openai-compatible',
ADD COLUMN "capabilities" JSONB;
