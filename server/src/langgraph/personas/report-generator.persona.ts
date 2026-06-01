import { z } from 'zod';
import type { PersonaDefinition } from './persona.interface';

export const ReportSchema = z.object({
  techScore: z.number().min(1).max(10).default(5),
  behavScore: z.number().min(1).max(10).default(5),
  overallScore: z.number().min(1).max(10).default(5),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  summary: z.string().default(''),
  recommendation: z.enum(['推荐', '保留', '不推荐']).default('保留'),
});

export const reportGeneratorPersona: PersonaDefinition = {
  id: 'reporting:final-report',
  name: '正在生成评估报告...',
  systemPrompt: `你是一个面试评估专家。根据完整的面试记录生成综合评估报告。`,
  temperature: 0.3,
  streaming: false,
  outputMode: 'structured',
  schema: ReportSchema,
};
