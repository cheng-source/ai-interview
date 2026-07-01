import { pushEvent } from "../llm";
import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions } from "./persona-types";

export interface PersonaWarningMetadata {
  providerId?: string;
  model?: string;
  baseURL?: string;
  protocol?: string;
  outputMode?: string;
  failureKind?: string;
}

export function emitPersonaWarning(
  persona: PersonaDefinition,
  code: string,
  message: string,
  options: PersonaExecuteOptions | undefined,
  attempt?: number,
  metadata?: PersonaWarningMetadata,
) {
  if (options?.silent) return;
  pushEvent({
    type: "llm_warning",
    code,
    message,
    personaId: persona.id,
    attempt,
    ...metadata,
  });
}
