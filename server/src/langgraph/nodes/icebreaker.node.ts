import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function icebreakerNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.7 });

  const candidate = state.candidate;
  const position = state.position;

  const response = await llm.invoke([
    new SystemMessage(`你是一个专业友好的AI面试官。根据候选人背景生成一段开场白（2-3句话），
内容包括：
1. 问候并自我介绍
2. 提到候选人的某个项目或技能以示关注
3. 简要说明今天面试的流程
不要使用任何markdown格式。`),
    new HumanMessage(`候选人：${candidate.name}，技能：${(candidate.skills || []).join(', ')}，
岗位：${position.title}，部门：${position.department}`),
  ]);

  const content = typeof response.content === 'string'
    ? response.content : '';

  return {
    messages: [new AIMessage(content)],
    currentStage: 'icebreaker',
  };
}
