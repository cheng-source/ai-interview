import { pushEvent } from "../llm";
import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions, PersonaResult } from "./persona-types";
import { createSchemaFallback } from "./structured-output";

function createTextFallback(persona: PersonaDefinition): string {
  if (persona.id.includes("followup")) {
    return "请你再展开说明一下关键细节：当时的背景是什么、你具体做了什么、结果如何？ [time] 180";
  }

  if (persona.id.includes("behavioral")) {
    return "请分享一个和岗位要求相关的具体经历，说明背景、你的行动、最终结果和复盘。 [time] 240";
  }

  if (persona.id.includes("candidate")) {
    return "这个问题我先简要回答：我们会结合岗位要求、你的项目经历和现场回答综合评估。你也可以继续问下一个关心的问题。";
  }

  return "**技术面试题**（技术基础 | 难度: ★★★）\n请结合你最近的一个项目，说明其中一个核心技术难点、你的解决方案、关键取舍以及最终效果。\n[time] 240";
}

export function createPersonaFallback(
  persona: PersonaDefinition,
  options?: PersonaExecuteOptions,
): PersonaResult {
  if (persona.outputMode === "structured" && persona.schema) {
    return { response: createSchemaFallback(persona.schema), content: "" };
  }

  const content = createTextFallback(persona);
  if (!options?.silent) {
    pushEvent({ type: "token", content });
    pushEvent({ type: "token_end" });
  }
  return { response: null, content };
}
