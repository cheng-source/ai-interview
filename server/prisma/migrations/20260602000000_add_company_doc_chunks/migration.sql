-- CreateTable
CREATE TABLE "CompanyDocChunk" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(1024),

    CONSTRAINT "CompanyDocChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyDocChunk_docId_idx" ON "CompanyDocChunk"("docId");

-- CreateIndex (HNSW vector index for cosine similarity search)
CREATE INDEX "CompanyDocChunk_embedding_idx" ON "CompanyDocChunk" USING hnsw (embedding vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "CompanyDocChunk" ADD CONSTRAINT "CompanyDocChunk_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CompanyDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
