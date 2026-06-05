import { SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createLLM, setCallType, pushEvent } from '../llm';
import type { PersonaDefinition } from './persona.interface';

export interface PersonaResult {
  response: any;
  content: string;
}

/** 从 Zod schema 生成 JSON 格式说明（供 prompt 使用） */
function zodToJsonTemplate(schema: z.ZodTypeAny): string {
  const inner = unwrapDefault(schema);

  if (inner instanceof z.ZodObject) {
    const shape = (inner as any)._def.shape() as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape).map(([key, val]) => {
      const optional = val instanceof z.ZodDefault || val instanceof z.ZodOptional;
      const fieldSchema = optional ? unwrapDefault(val) : val;
      const typeDesc = describeType(fieldSchema);
      return `  "${key}": ${typeDesc}${optional ? ' // optional' : ''}`;
    }).join(',\n');
    return `{\n${fields}\n}`;
  }

  if (inner instanceof z.ZodArray) {
    const elem = describeType(inner.element);
    return `[${elem}, ...]`;
  }

  return describeType(inner);
}

function unwrapDefault(s: z.ZodTypeAny): z.ZodTypeAny {
  if (s instanceof z.ZodDefault) return s._def.innerType;
  if (s instanceof z.ZodOptional) return s._def.innerType;
  return s;
}

function describeType(s: z.ZodTypeAny): string {
  const inner = unwrapDefault(s);
  if (inner instanceof z.ZodString) return 'string';
  if (inner instanceof z.ZodNumber) return 'number';
  if (inner instanceof z.ZodBoolean) return 'boolean';
  if (inner instanceof z.ZodEnum) return (inner as z.ZodEnum<any>).options.map((o: string) => `"${o}"`).join(' | ');
  if (inner instanceof z.ZodArray) {
    const elem = describeType(inner.element);
    return `[${elem}, ...]`;
  }
  if (inner instanceof z.ZodObject) return zodToJsonTemplate(inner);
  return 'string';
}

/** 从 LLM 文本响应中提取并校验 JSON */
function parseStructuredResponse(raw: string, schema: z.ZodSchema): any {
  // 先尝试提取 ```json ... ``` 代码块内容
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = codeBlock ? codeBlock[1] : raw;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return schema.parse({});
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return schema.parse(parsed);
  } catch {
    return schema.parse({});
  }
}

/** 统一执行 persona：创建 LLM → 配置流式/结构化 → invoke */
export async function executePersona(
  persona: PersonaDefinition,
  userMessage: any,
  options?: { silent?: boolean },
): Promise<PersonaResult> {
  if (!options?.silent) {
    pushEvent({ type: 'status', content: persona.name });
  }

  setCallType(persona.streaming ? 'text' : 'structured');

  const llm = createLLM({
    temperature: persona.temperature,
    streaming: persona.streaming,
  });

  if (persona.outputMode === 'structured' && persona.schema) {
    // 用 prompt 方式输出 JSON，避免 withStructuredOutput 的 tool_choice 在 thinking 模式下报错
    const jsonTemplate = zodToJsonTemplate(persona.schema);
    const jsonPrompt = `${persona.systemPrompt}\n\n只输出纯 JSON，不要用 markdown 代码块包裹。格式如下：\n${jsonTemplate}`;
    const messages = [new SystemMessage(jsonPrompt), userMessage];
    const response = await llm.invoke(messages);
    const rawContent = typeof response.content === 'string' ? response.content : '';
    return { response: parseStructuredResponse(rawContent, persona.schema), content: '' };
  }

  const messages = [new SystemMessage(persona.systemPrompt), userMessage];
  const response = await llm.invoke(messages);
  const content = typeof response.content === 'string' ? response.content : '';

  if (persona.streaming && !options?.silent) {
    pushEvent({ type: 'token_end' });
  }

  return { response, content };
}
