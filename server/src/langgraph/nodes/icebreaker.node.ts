import { interrupt } from '@langchain/langgraph';
import { pushEvent } from '../llm';

export async function icebreakerNode(state: any): Promise<any> {
  const candidateAnswer = state.candidateAnswer || '';

  if (!candidateAnswer.trim()) {
    const greeting = `${state.candidate?.name || '你好'}，我是今天的AI面试官。请先做一个简单的自我介绍吧。`;
    console.log('[icebreaker] greeting, current answerHistory:', state.answerHistory?.length);
    pushEvent({ type: 'message', content: greeting, stage: 'icebreaker' });
    pushEvent({ type: 'stage', stage: 'icebreaker' });
    interrupt({ type: 'waiting_for_self_intro' });
    // interrupt 会 throw，此处 return 不会执行；招呼语已通过 initialState 写入 answerHistory
    return {};
  }

  return {
    currentStage: 'icebreaker',
    candidateIntro: candidateAnswer,
    candidateAnswer: '',
    answerHistory: [{
      stage: 'icebreaker',
      answer: candidateAnswer,
    }],
  };
}
