import type { PersonaDefinition } from './persona.interface';

export const techFollowupPersona: PersonaDefinition = {
  id: 'technical:followup',
  name: '正在生成追问...',
  systemPrompt: `你是技术面试官，需要针对候选人回答的不足进行追问。
追问要具体、有针对性，指向回答中的盲区或表面部分。`,
  temperature: 0.6,
  streaming: true,
  outputMode: 'text',
};
