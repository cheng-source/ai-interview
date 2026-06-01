import { z } from 'zod';
import type { PersonaDefinition } from './persona.interface';

export const TechEvalSchema = z.object({
  score: z.number().min(1).max(10).default(5),
  isCorrect: z.boolean().default(false),
  isSurfaceLevel: z.boolean().default(true),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

export const techEvaluatorPersona: PersonaDefinition = {
  id: 'technical:evaluation',
  name: '正在评估回答...',
  systemPrompt: `评估候选人的技术回答。isSurfaceLevel 为 true 表示回答停留在表面，缺乏深度。`,
  temperature: 0.3,
  streaming: false,
  outputMode: 'structured',
  schema: TechEvalSchema,
};
