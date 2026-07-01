import { SystemMessage } from "@langchain/core/messages";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { securePromptData } from "../prompt-security";

/**
 * 从 LangChain AIMessage 提取纯文本内容。
 * 兼容 string 与 content blocks 数组（thinking 模型可能返回
 * [{type:"text", text:"..."}] 形式），避免把数组当成空串导致 JSON 提取失败。
 */
export function extractRawContent(response: any): string {
  const content = response?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) =>
        typeof part === "string" ? part : part?.text ?? "",
      )
      .join("");
  }
  return "";
}

export function zodToJsonTemplate(schema: z.ZodTypeAny): string {
  const inner = unwrapDefault(schema);

  if (inner instanceof z.ZodObject) {
    const shape = (inner as any)._def.shape() as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape)
      .map(([key, val]) => {
        const optional =
          val instanceof z.ZodDefault || val instanceof z.ZodOptional;
        const fieldSchema = optional ? unwrapDefault(val) : val;
        const typeDesc = describeType(fieldSchema);
        return `  "${key}": ${typeDesc}${optional ? " // optional" : ""}`;
      })
      .join(",\n");
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
  if (inner instanceof z.ZodString) return "string";
  if (inner instanceof z.ZodNumber) return "number";
  if (inner instanceof z.ZodBoolean) return "boolean";
  if (inner instanceof z.ZodEnum) {
    return (inner as z.ZodEnum<any>).options
      .map((o: string) => `"${o}"`)
      .join(" | ");
  }
  if (inner instanceof z.ZodArray) {
    const elem = describeType(inner.element);
    return `[${elem}, ...]`;
  }
  if (inner instanceof z.ZodObject) return zodToJsonTemplate(inner);
  return "string";
}

/**
 * 递归把 null 转成 undefined。
 * LLM 习惯用 null 表示「没有该值」，但 Zod 的 .default() 只对 undefined 生效、
 * 不处理 null，会导致 z.string().default('') 这种字段在 LLM 返回 null 时报
 * invalid_type。转成 undefined 后，各 schema 自带的 default 即可正常兜底。
 */
function stripNulls(value: any): any {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripNulls(v);
    return out;
  }
  return value;
}

export function parseStructuredResponseStrict(
  raw: string,
  schema: z.ZodSchema,
): any {
  const jsonText = extractJsonObjectText(raw);

  try {
    const parsed = stripNulls(JSON.parse(jsonText));
    return schema.parse(parsed);
  } catch (error: any) {
    const kind = error instanceof z.ZodError ? "schema_parse" : "invalid_json";
    throw new Error(`${kind}: ${error?.message || String(error)}`);
  }
}

export function parseStructuredResponseWithLocalRepair(
  raw: string,
  schema: z.ZodSchema,
): any {
  try {
    return parseStructuredResponseStrict(raw, schema);
  } catch (firstError: any) {
    try {
      const repaired = jsonrepair(extractJsonObjectText(raw));
      const parsed = stripNulls(JSON.parse(repaired));
      return schema.parse(parsed);
    } catch (repairError: any) {
      const message =
        repairError?.message || firstError?.message || String(repairError);
      const kind = repairError instanceof z.ZodError ? "schema_parse" : "invalid_json";
      throw new Error(`${kind}: ${message}`);
    }
  }
}

function extractJsonObjectText(raw: string): string {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = codeBlock ? codeBlock[1] : raw;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in structured LLM response");
  }
  return jsonMatch[0];
}

export async function repairStructuredJson(
  llm: any,
  raw: string,
  schema: z.ZodSchema,
  jsonTemplate: string,
): Promise<any> {
  const repairPrompt = `下面是一个模型返回内容，它本应是 JSON，但格式可能有问题。
请只返回修复后的纯 JSON，不要解释，不要 markdown。

目标格式：
${jsonTemplate}

原始内容：
${securePromptData("raw_model_output", raw)}`;
  const response = await llm.invoke([new SystemMessage(repairPrompt)]);
  const content = extractRawContent(response);
  return parseStructuredResponseStrict(content, schema);
}

export function createSchemaFallback(schema: z.ZodSchema): any {
  const result = schema.safeParse({});
  if (result.success) return result.data;
  throw new Error("Structured response fallback failed schema validation");
}
