import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

const COMPETENCY_QUESTIONS: Record<string, string> = {
  communication: '沟通协作能力',
  problemSolving: '问题分析与解决能力',
  teamwork: '团队合作经历',
  leadership: '领导力或主动性',
  adaptability: '适应能力和学习能力',
};

export async function behavioralSelectNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.5 });
  const { behavioralRound, position } = state;
  const competencies = behavioralRound.competencies || [];
  const askedCount = (behavioralRound.questionsAsked || []).length;

  if (competencies.length === 0 || askedCount >= competencies.length + 1) {
    return { currentStage: 'qa' };
  }

  const currentCompetency = competencies[askedCount] || competencies[0];

  const response = await llm.invoke([
    new SystemMessage(`你是行为面试官。生成一道行为面试题，考察 STAR 方法。
能力维度: ${COMPETENCY_QUESTIONS[currentCompetency] || currentCompetency}。
返回JSON: { "text": "题目内容", "topic": "能力维度名称" }。
题目要引导候选人用具体事例回答。`),
    new HumanMessage(`岗位: ${position.title}，JD: ${position.jdText}`),
  ]);

  let question: any = {
    text: `请分享一个体现你${COMPETENCY_QUESTIONS[currentCompetency]}的具体事例`,
    topic: currentCompetency,
    difficulty: 3,
  };
  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    question = jsonMatch ? { ...question, ...JSON.parse(jsonMatch[0]) } : question;
  } catch {}

  return {
    behavioralRound: {
      ...behavioralRound,
      currentQuestion: { ...question, type: 'behavioral' },
      depth: 0,
    },
  };
}

export async function behavioralAskNode(state: any): Promise<any> {
  const question = state.behavioralRound.currentQuestion;
  if (!question) return {};

  const message = `**行为面试题** (${question.topic})

${question.text}

请用 STAR 方法（Situation-Task-Action-Result）描述。`;

  return { messages: [new AIMessage(message)] };
}

export async function behavioralEvaluateNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.3 });
  const question = state.behavioralRound.currentQuestion;
  const candidateAnswer = state.candidateAnswer || '';

  const response = await llm.invoke([
    new SystemMessage(`评估候选人的行为面试回答。返回JSON:
{
  "score": 1-10,
  "isCorrect": true,
  "isSurfaceLevel": false,
  "isVague": true/false,
  "strengths": ["亮点"],
  "gaps": ["不足"],
  "summary": "一句话评价"
}
isVague 为 true 表示回答空洞、缺乏具体实例。`),
    new HumanMessage(`题目: ${question.text}\n候选人回答: ${candidateAnswer}`),
  ]);

  let evaluation: any = { score: 5, isCorrect: true, isSurfaceLevel: false, isVague: false, strengths: [], gaps: [], summary: '' };
  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? { ...evaluation, ...JSON.parse(jsonMatch[0]) } : evaluation;
  } catch {}

  const scores = { ...state.scores };
  scores.behavioral = (scores.behavioral || 0) + evaluation.score;

  return {
    answerHistory: [{
      stage: 'behavioral',
      question: state.behavioralRound.currentQuestion,
      answer: candidateAnswer,
      evaluation,
    }],
    scores,
    candidateAnswer: '',
  };
}

export async function behavioralFollowUpNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.6 });
  const answerHistory = state.answerHistory || [];
  const lastRecord = answerHistory[answerHistory.length - 1];

  const response = await llm.invoke([
    new SystemMessage(`你是行为面试官。候选人的回答过于笼统，要求其补充具体的实例和细节。
引导他/她给出具体场景、行动步骤、结果数据。`),
    new HumanMessage(`题目: ${lastRecord?.question?.text}\n回答: ${lastRecord?.answer}\n评价: 回答空洞，缺乏具体案例`),
  ]);

  const content = typeof response.content === 'string' ? response.content : '能举一个更具体的例子吗？';

  return {
    messages: [new AIMessage(content)],
    behavioralRound: {
      ...state.behavioralRound,
      depth: (state.behavioralRound.depth || 0) + 1,
    },
  };
}

export async function behavioralNextQuestionNode(state: any): Promise<any> {
  return {
    behavioralRound: {
      ...state.behavioralRound,
      currentQuestion: null,
      depth: 0,
    },
  };
}
