export interface ProviderDto {
  id: string;
  protocol: string;
  baseUrl: string;
  maskedApiKey: string;
  model: string;
  capabilities?: Record<string, boolean> | null;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  supportsEmbedding: boolean;
  temperature?: number | null;
  enabled: boolean;
  builtin: boolean;
  defaultChatProvider: boolean;
  defaultEmbeddingProvider: boolean;
}

export interface UpsertProviderDto {
  id?: string;
  protocol?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  capabilities?: Record<string, boolean> | null;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  supportsEmbedding?: boolean;
  temperature?: number | null;
  enabled?: boolean;
}

export interface DefaultProviderDto {
  defaultProvider?: string;
  defaultEmbeddingProvider?: string | null;
}
