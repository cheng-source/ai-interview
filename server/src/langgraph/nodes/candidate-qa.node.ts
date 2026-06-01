import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createLLM, setCallType } from '../llm';
import { candidateQaPersona } from '../personas/candidate-qa.persona';

async function searchKnowledge(query: string): Promise<string> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const result = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
      `SELECT content FROM "CompanyDoc" WHERE content ILIKE $1 LIMIT 3`,
      `%${query}%`,
    );
    await prisma.$disconnect();
    return (result || []).map((r) => r.content).join('\n---\n') || '';
  } catch {
    return '';
  }
}

export async function candidateQaNode(state: any): Promise<any> {
  setCallType('text');
  const llm = createLLM({
    temperature: candidateQaPersona.temperature,
    streaming: candidateQaPersona.streaming,
  });

  const candidateQuestion = state.candidateAnswer || '';
  const qaCount = state.qaCount || 0;

  // 手动检索知识库，避免 bindTools 走 function calling 在 thinking 模式下报错
  const knowledge = candidateQuestion
    ? await searchKnowledge(candidateQuestion)
    : '';

  const systemPrompt = knowledge
    ? `${candidateQaPersona.systemPrompt}\n\n以下是从公司知识库检索到的相关信息，请据此回答：\n${knowledge}\n\n这是第${qaCount}个问题，最多回答5个问题。`
    : `${candidateQaPersona.systemPrompt}\n这是第${qaCount}个问题，最多回答5个问题。`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(candidateQuestion || '你好，我想了解一下...'),
  ]);

  const content = typeof response.content === 'string' ? response.content : '';

  return {
    messages: [new AIMessage(content)],
    qaCount: qaCount + 1,
    candidateAnswer: '',
  };
}
