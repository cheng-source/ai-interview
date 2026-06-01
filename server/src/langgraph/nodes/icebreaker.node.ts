import { interrupt } from '@langchain/langgraph';
import { pushEvent } from '../llm';

export async function icebreakerNode(state: any): Promise<any> {
  const candidate = state.candidate;
  const candidateAnswer = state.candidateAnswer || '';

  // 首次进入：等待用户自我介绍（开场白已由 service 层发送）
  if (!candidateAnswer.trim()) {
    pushEvent({ type: 'stage', stage: 'icebreaker' });
    interrupt({ type: 'waiting_for_self_intro' });
    return {};
  }

  // 用户已回复自我介绍：保存供后续出题使用
  return {
    currentStage: 'icebreaker',
    candidateIntro: candidateAnswer,
    candidateAnswer: '',
  };
}
