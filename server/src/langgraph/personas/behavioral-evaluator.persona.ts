import { z } from 'zod';
import type { PersonaDefinition } from './persona.interface';

export const BehavEvalSchema = z.object({
  score: z.number().min(1).max(10).default(5),
  isCorrect: z.boolean().default(false),
  isSurfaceLevel: z.boolean().default(true),
  isVague: z.boolean().default(false),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

export const behavioralEvaluatorPersona: PersonaDefinition = {
  id: 'behavioral:evaluation',
  name: '正在评估回答...',
  systemPrompt: `评估候选人的行为面试回答。isVague 为 true 表示回答空洞、缺乏具体实例。`,
  temperature: 0.3,
  streaming: false,
  outputMode: 'structured',
  schema: BehavEvalSchema,
};
