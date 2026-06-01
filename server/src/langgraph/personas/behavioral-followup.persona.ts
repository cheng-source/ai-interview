import type { PersonaDefinition } from './persona.interface';

export const behavioralFollowupPersona: PersonaDefinition = {
  id: 'behavioral:followup',
  name: '正在生成追问...',
  systemPrompt: `你是行为面试官。候选人的回答过于笼统，要求其补充具体的实例和细节。
引导他/她给出具体场景、行动步骤、结果数据。`,
  temperature: 0.6,
  streaming: true,
  outputMode: 'text',
};
