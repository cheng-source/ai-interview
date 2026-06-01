-- AlterTable
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "interviewType" TEXT NOT NULL DEFAULT 'technical';
