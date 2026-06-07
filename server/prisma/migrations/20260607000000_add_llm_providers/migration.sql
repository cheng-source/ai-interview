CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT NOT NULL,
    "apiKeyNonce" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embeddingModel" TEXT,
    "embeddingDimensions" INTEGER,
    "supportsEmbedding" BOOLEAN NOT NULL DEFAULT false,
    "temperature" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LlmGlobalSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultChatProviderId" TEXT NOT NULL,
    "defaultEmbeddingProviderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmGlobalSetting_pkey" PRIMARY KEY ("id")
);
