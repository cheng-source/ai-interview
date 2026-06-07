export interface ProviderDto {
  id: string;
  baseUrl: string;
  maskedApiKey: string;
  model: string;
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
  baseUrl?: string;
  apiKey?: string;
  model?: string;
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
