import { pushEvent } from "../llm";
import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions } from "./persona-types";

export function emitPersonaWarning(
  persona: PersonaDefinition,
  code: string,
  message: string,
  options: PersonaExecuteOptions | undefined,
  attempt?: number,
) {
  if (options?.silent) return;
  pushEvent({
    type: "llm_warning",
    code,
    message,
    personaId: persona.id,
    attempt,
  });
}
