import { z } from 'zod';

export type OutputMode = 'text' | 'structured';

export interface PersonaDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  temperature: number;
  streaming: boolean;
  outputMode: OutputMode;
  schema?: z.ZodSchema;
}
