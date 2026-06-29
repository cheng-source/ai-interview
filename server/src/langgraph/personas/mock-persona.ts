import { z } from "zod";
import { pushEvent } from "../llm";
import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions, PersonaResult } from "./persona-types";

const FAKE_TOKENS = [
  "好的",
  "，",
  "让我",
  "来",
  "分析",
  "一下",
  "。",
  "根据",
  "你的",
  "简历",
  "，",
];

export function isMockEnabled(): boolean {
  return process.env.LLM_MOCK === "true";
}

function generateFakeValue(key: string, schema: z.ZodTypeAny): any {
  const inner =
    schema instanceof z.ZodDefault || schema instanceof z.ZodOptional
      ? (schema as any)._def.innerType || schema
      : schema;

  if (inner instanceof z.ZodString) return `mock_${key}_${Date.now()}`;
  if (inner instanceof z.ZodNumber) return Math.floor(Math.random() * 100);
  if (inner instanceof z.ZodBoolean) return true;
  if (inner instanceof z.ZodArray) return [];
  if (inner instanceof z.ZodEnum) {
    return (inner as any)._def.values?.[0] || "mock";
  }
  if (inner instanceof z.ZodObject) {
    const shape = (inner as any)._def.shape();
    if (typeof shape === "function") {
      const obj: Record<string, any> = {};
      for (const k of Object.keys(shape())) {
        obj[k] = generateFakeValue(k, shape()[k]);
      }
      return obj;
    }
  }
  return "mock";
}

function generateFakeStructuredOutput(persona: PersonaDefinition): any {
  if (!persona.schema) return { mock: true };
  const unwrapped =
    persona.schema instanceof z.ZodDefault
      ? (persona.schema as any)._def.innerType
      : persona.schema;
  if (unwrapped instanceof z.ZodObject) {
    const shape = (unwrapped as any)._def.shape();
    const obj: Record<string, any> = {};
    if (typeof shape === "function") {
      for (const key of Object.keys(shape())) {
        try {
          obj[key] = generateFakeValue(key, shape()[key]);
        } catch {
          obj[key] = "mock";
        }
      }
    }
    return obj;
  }
  return { mock: true };
}

export async function mockExecutePersona(
  persona: PersonaDefinition,
  options?: PersonaExecuteOptions,
): Promise<PersonaResult> {
  const silent = options?.silent || false;

  if (persona.outputMode === "structured") {
    if (!silent) pushEvent({ type: "status", content: persona.name + " (mock)" });
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    const fakeResponse = generateFakeStructuredOutput(persona);
    const fakeContent = JSON.stringify(fakeResponse);
    if (!silent) {
      pushEvent({ type: "token", content: fakeContent });
      pushEvent({ type: "token_end" });
    }
    return { response: fakeResponse, content: fakeContent };
  }

  if (!silent) pushEvent({ type: "status", content: persona.name + " (mock)" });

  const tokens = [...FAKE_TOKENS];
  let content = "";

  for (const token of tokens) {
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 50));
    content += token;
    if (!silent) pushEvent({ type: "token", content: token });
  }

  if (!silent) pushEvent({ type: "token_end" });

  return { response: null, content };
}
