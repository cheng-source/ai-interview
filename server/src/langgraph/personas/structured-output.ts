import { SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { securePromptData } from "../prompt-security";

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

export function parseStructuredResponseStrict(
  raw: string,
  schema: z.ZodSchema,
): any {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = codeBlock ? codeBlock[1] : raw;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in structured LLM response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return schema.parse(parsed);
  } catch (error: any) {
    const kind = error instanceof z.ZodError ? "schema_parse" : "invalid_json";
    throw new Error(`${kind}: ${error?.message || String(error)}`);
  }
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
  const content = typeof response.content === "string" ? response.content : "";
  return parseStructuredResponseStrict(content, schema);
}

export function createSchemaFallback(schema: z.ZodSchema): any {
  const result = schema.safeParse({});
  if (result.success) return result.data;
  throw new Error("Structured response fallback failed schema validation");
}
