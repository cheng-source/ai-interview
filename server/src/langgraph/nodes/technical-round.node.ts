import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function techSelectNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.5 });
  const { techRound, position, candidate } = state;
  const topics = techRound.topics || [];
  const askedCount = (techRound.questionsAsked || []).length;

  if (topics.length === 0 || askedCount >= topics.length + 3) {
    return { currentStage: 'behavioral' };
  }

  const currentTopic = topics[askedCount] || topics[0];

  const response = await llm.invoke([
    new SystemMessage(`你是一个技术面试官。基于岗位JD和候选人技能，生成一道技术面试题。
返回JSON: { "text": "题目内容", "topic": "技术领域", "difficulty": 1-5 }。
题目难度: ${askedCount === 0 ? 2 : askedCount < 2 ? 3 : 4}。
当前考察领域: ${currentTopic}。`),
    new HumanMessage(`岗位: ${position.title}，JD: ${position.jdText}，候选人技能: ${(candidate.skills || []).join(', ')}`),
  ]);

  let question: any = { text: '', topic: currentTopic, difficulty: 3 };
  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    question = jsonMatch ? { ...question, ...JSON.parse(jsonMatch[0]) } : question;
  } catch {}

  return {
    techRound: {
      ...techRound,
      currentQuestion: { ...question, type: 'technical' },
      currentTopic: question.topic || currentTopic,
      depth: 0,
    },
  };
}

export async function techAskNode(state: any): Promise<any> {
  const question = state.techRound.currentQuestion;
  if (!question) return {};

  const message = `**技术面试题** (${question.topic} | 难度: ${'★'.repeat(question.difficulty || 3)}${'☆'.repeat(5 - (question.difficulty || 3))})

${question.text}

请编写代码或详细描述你的思路。`;

  return { messages: [new AIMessage(message)] };
}

export async function techEvaluateNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.3 });
  const question = state.techRound.currentQuestion;
  const candidateAnswer = state.candidateAnswer || '';

  const response = await llm.invoke([
    new SystemMessage(`评估候选人的技术回答。返回JSON:
{
  "score": 1-10,
  "isCorrect": true/false,
  "isSurfaceLevel": true/false,
  "strengths": ["亮点"],
  "gaps": ["不足或盲区"],
  "summary": "一句话评价"
}
isSurfaceLevel 为 true 表示回答停留在表面，缺乏深度。`),
    new HumanMessage(`题目: ${question.text}\n候选人回答: ${candidateAnswer}`),
  ]);

  let evaluation: any = { score: 5, isCorrect: false, isSurfaceLevel: true, isVague: false, strengths: [], gaps: [], summary: '' };
  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? { ...evaluation, ...JSON.parse(jsonMatch[0]) } : evaluation;
  } catch {}

  const scores = { ...state.scores };
  scores.technical = (scores.technical || 0) + evaluation.score;

  return {
    answerHistory: [{
      stage: 'technical',
      question: state.techRound.currentQuestion,
      answer: candidateAnswer,
      evaluation,
    }],
    scores,
    candidateAnswer: '',
  };
}

export async function techFollowUpNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.6 });
  const question = state.techRound.currentQuestion;
  const answerHistory = state.answerHistory || [];
  const lastEval = answerHistory[answerHistory.length - 1]?.evaluation || {};
  const lastAnswer = answerHistory[answerHistory.length - 1]?.answer || '';

  const response = await llm.invoke([
    new SystemMessage(`你是技术面试官，需要针对候选人回答的不足进行追问。
追问要具体、有针对性，指向回答中的盲区或表面部分。
追问深度：第${(state.techRound.depth || 0) + 1}层追问。`),
    new HumanMessage(`原题: ${question.text}\n回答: ${lastAnswer}\n评估: ${JSON.stringify(lastEval)}`),
  ]);

  const content = typeof response.content === 'string' ? response.content : '请再详细说说...';

  return {
    messages: [new AIMessage(content)],
    techRound: {
      ...state.techRound,
      depth: (state.techRound.depth || 0) + 1,
    },
  };
}

export async function techNextTopicNode(state: any): Promise<any> {
  return {
    techRound: {
      ...state.techRound,
      currentQuestion: null,
      depth: 0,
    },
  };
}
