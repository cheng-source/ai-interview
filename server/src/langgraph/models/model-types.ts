import type { z } from "zod";
import type { PersonaDefinition } from "../personas/persona.interface";
import type { PersonaExecuteOptions, PersonaResult } from "../personas/persona-types";

export type ModelProviderProtocol = "openai-compatible";

export interface ModelProviderCapabilities {
  streaming?: boolean;
  jsonMode?: boolean;
  jsonSchema?: boolean;
  toolCalling?: boolean;
}

export interface PersonaModelInvokeInput {
  persona: PersonaDefinition;
  userMessage: any;
  options?: PersonaExecuteOptions;
  providerId?: string;
  streaming: boolean;
}

export interface StructuredModelInvokeInput extends PersonaModelInvokeInput {
  schema: z.ZodSchema;
}

export interface ModelAdapter {
  invokeText(input: PersonaModelInvokeInput): Promise<PersonaResult>;
  invokeStructured(input: StructuredModelInvokeInput): Promise<PersonaResult>;
}
