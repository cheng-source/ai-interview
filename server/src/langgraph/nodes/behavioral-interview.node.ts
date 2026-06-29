import { HumanMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import { pushEvent } from '../llm';
import { executePersona } from '../personas/persona-executor';
import { behavioralInterviewerPersona } from '../personas/behavioral-interviewer.persona';
import { behavioralEvaluatorPersona } from '../personas/behavioral-evaluator.persona';
import { behavioralFollowupPersona } from '../personas/behavioral-followup.persona';
import { securePromptData } from '../prompt-security';

const COMPETENCY_QUESTIONS: Record<string, string> = {
  communication: '沟通协作能力',
  problemSolving: '问题分析与解决能力',
  teamwork: '团队合作经历',
  leadership: '领导力或主动性',
  adaptability: '适应能力和学习能力',
};

export async function askBehavioralQuestionNode(state: any): Promise<any> {
  const { behavioralRound, position } = state;
  const competencies = behavioralRound.competencies || [];
  const askedCount = (behavioralRound.questionsAsked || []).length;

  if (competencies.length === 0 || askedCount >= competencies.length + 1) {
    pushEvent({ type: "stage", stage: "qa" });
    return { currentStage: 'qa' };
  }

  const currentCompetency = competencies[askedCount] || competencies[0];
  const competencyLabel = COMPETENCY_QUESTIONS[currentCompetency] || currentCompetency;

  // 将动态 competencyLabel 注入 persona prompt
  const persona = {
    ...behavioralInterviewerPersona,
    systemPrompt: behavioralInterviewerPersona.systemPrompt
      .replace(/\$\{competencyLabel\}/g, competencyLabel),
  };

  const { content } = await executePersona(persona, new HumanMessage(
    `【岗位信息】
${securePromptData("position", `${position.title} | ${position.department} | 级别: ${position.level || '未指定'}`)}
【岗位JD】
${securePromptData("jd", position.jdText)}
【候选人自我介绍】
${securePromptData("candidate_intro", state.candidateIntro || "暂无")}
【考察能力】
${securePromptData("competency", competencyLabel)}`,
  ));

  const fallbackText = `请分享一个体现你${competencyLabel}的具体事例`;
  const actualContent = content || fallbackText;

  const timeMatch = actualContent.match(/\[time\]\s*(\d+)/);
  const timeLimit = timeMatch ? parseInt(timeMatch[1]) : 240;

  return {
    currentStage: 'behavioral',
    behavioralRound: {
      ...behavioralRound,
      currentQuestion: { text: actualContent, topic: currentCompetency, type: 'behavioral', difficulty: 3, timeLimit },
      depth: 0,
    },
  };
}

export async function evaluateBehavioralAnswerNode(state: any): Promise<any> {
  const question = state.behavioralRound.currentQuestion;
  const candidateAnswer = state.candidateAnswer || '';

  if (!question) {
    pushEvent({ type: "stage", stage: "qa" });
    return { candidateAnswer: '', currentStage: 'qa' };
  }

  if (!candidateAnswer.trim()) {
    interrupt({ type: 'waiting_for_answer' });
    return {};
  }

  const { response: evaluation } = await executePersona(behavioralEvaluatorPersona, new HumanMessage(
    `题目:
${securePromptData("question", question.text)}

候选人回答:
${securePromptData("candidate_answer", candidateAnswer)}`,
  ));

  const scores = { ...state.scores };
  scores.behavioral = (scores.behavioral || 0) + evaluation.score;

  pushEvent({ type: "evaluation", data: evaluation, stage: "behavioral" });

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

export async function askBehavioralFollowUpNode(state: any): Promise<any> {
  const question = state.behavioralRound.currentQuestion;
  const answerHistory = state.answerHistory || [];
  const lastRecord = answerHistory[answerHistory.length - 1];

  const { content } = await executePersona(behavioralFollowupPersona, new HumanMessage(
    `题目:
${securePromptData("question", lastRecord?.question?.text)}

回答:
${securePromptData("candidate_answer", lastRecord?.answer)}

评价: 回答空洞，缺乏具体案例`,
  ));

  const followUpText = content || '能举一个更具体的例子吗？';
  // 从 LLM 输出中解析难度星级和 [time]，与 select 节点一致
  const starMatch = followUpText.match(/\*\*.+?\*\*\s*\(.+?\s*\|\s*难度:\s*(★+)/);
  const difficulty = starMatch ? starMatch[1].length : question?.difficulty || 3;
  const timeToSec: Record<number, number> = { 1: 120, 2: 180, 3: 240, 4: 300, 5: 420 };
  const timeMatch = followUpText.match(/\[time\]\s*(\d+)/);
  const timeLimit = timeMatch ? parseInt(timeMatch[1]) : timeToSec[difficulty] || 240;

  return {
    currentStage: 'behavioral',
    behavioralRound: {
      ...state.behavioralRound,
      currentQuestion: {
        ...question,
        text: followUpText,
        difficulty,
        timeLimit,
      },
      depth: (state.behavioralRound.depth || 0) + 1,
    },
  };
}

export async function advanceBehavioralCompetencyNode(state: any): Promise<any> {
  const prevQuestion = state.behavioralRound.currentQuestion;
  const questionsAsked = prevQuestion
    ? [...(state.behavioralRound.questionsAsked || []), prevQuestion]
    : state.behavioralRound.questionsAsked || [];

  return {
    behavioralRound: {
      ...state.behavioralRound,
      currentQuestion: null,
      questionsAsked,
      depth: 0,
    },
  };
}
