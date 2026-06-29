export interface PersonaResult {
  response: any;
  content: string;
}

export interface PersonaExecuteOptions {
  silent?: boolean;
  providerId?: string;
  maxRetries?: number;
  fallbackProviderIds?: string[];
}
