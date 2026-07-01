import { pushEvent } from "../llm";
import { invokePersonaModel } from "../models/model-router";
import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions, PersonaResult } from "./persona-types";
import { isMockEnabled, mockExecutePersona } from "./mock-persona";

export type { PersonaExecuteOptions, PersonaResult } from "./persona-types";

/** 统一执行 persona：只表达任务意图，具体模型选择/调用/降级交给模型层 */
export async function executePersona(
  persona: PersonaDefinition,
  userMessage: any,
  options?: PersonaExecuteOptions,
): Promise<PersonaResult> {
  if (isMockEnabled()) {
    return mockExecutePersona(persona, options);
  }

  if (!options?.silent) {
    pushEvent({ type: "status", content: persona.name });
  }

  return invokePersonaModel(persona, userMessage, options);
}
