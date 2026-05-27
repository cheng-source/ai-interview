import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

function createCompanyKnowledgeTool() {
  return new DynamicStructuredTool({
    name: 'retrieve_company_info',
    description: '检索公司内部知识库，获取福利制度、技术栈、团队架构、企业文化等信息',
    schema: z.object({ query: z.string().describe('搜索查询') }),
    func: async ({ query }) => {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const result = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
          `SELECT content FROM "CompanyDoc" WHERE content ILIKE $1 LIMIT 3`,
          `%${query}%`,
        );
        await prisma.$disconnect();
        return (result || []).map((r) => r.content).join('\n---\n') || '未找到相关信息';
      } catch {
        return '知识库暂时不可用';
      }
    },
  });
}

export async function candidateQaNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.7 });
  const candidateQuestion = state.candidateAnswer || '';
  const qaCount = state.qaCount || 0;

  const systemPrompt = `你是一个AI面试官，现在面试进入候选人反问环节。
如果候选人提问涉及公司信息（福利、文化、技术栈、团队），必须先调用 retrieve_company_info 工具检索文档。
如果候选人说"没有了"或"没有问题了"，回复结束语。
其他通用问题直接礼貌回答。
这是第${qaCount}个问题，最多回答5个问题。`;

  const llmWithTools = llm.bindTools([createCompanyKnowledgeTool()]);

  const response = await llmWithTools.invoke([
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
