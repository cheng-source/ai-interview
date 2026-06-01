import { z } from 'zod';
import type { PersonaDefinition } from './persona.interface';

export const ResumeOutputSchema = z.object({
  name: z.string().default(''),
  experience: z.number().default(0),
  skillCategories: z.array(z.object({
    category: z.string(),
    items: z.array(z.string()),
  })).default([]),
  projects: z.array(z.object({
    name: z.string(),
    summary: z.string(),
    highlights: z.array(z.string()),
  })).default([]),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
});

export const resumeParserPersona: PersonaDefinition = {
  id: 'parsing:resume',
  name: '正在解析简历...',
  systemPrompt: `你是一个专业的简历解析器。请仔细提取以下信息。

要求：
1. 技能特长必须按类别分组（如前端框架、后端技术、数据库、构建工具、云服务等），每个类别下列出具体技能
2. 项目经历中每个项目提取项目概要，以及每一条工作内容作为highlights（保留原文细节）
3. 所有字段都必须返回，即使为空数组`,
  temperature: 0.3,
  streaming: false,
  outputMode: 'structured',
  schema: ResumeOutputSchema,
};
