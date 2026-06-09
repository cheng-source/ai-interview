import { z } from "zod";

// 普通文本 或 结构化 JSON
export type OutputMode = "text" | "structured";

export interface PersonaDefinition {
  id: string;
  name: string; // 当前 persona 的展示名称。
  systemPrompt: string;
  temperature: number; //模型随机性参数。 数值越低，输出越稳定；数值越高，输出越发散。
  streaming: boolean; // 是否启用流式输出。
  outputMode: OutputMode;
  schema?: z.ZodSchema; // 结构化输出的 Zod 校验 schema。只有 outputMode: 'structured' 时才需要。
}
