-- AlterTable
ALTER TABLE "CompanyDocChunk" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompanyDocChunk" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "CompanyDocChunk_category_idx" ON "CompanyDocChunk"("category");
