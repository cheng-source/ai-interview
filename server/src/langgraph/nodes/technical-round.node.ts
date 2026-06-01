import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { executePersona } from "../personas/persona-executor";
import {
  techInterviewerPersona,
  techConceptInterviewerPersona,
} from "../personas/tech-interviewer.persona";
import { techEvaluatorPersona } from "../personas/tech-evaluator.persona";
import { techFollowupPersona } from "../personas/tech-followup.persona";

function difficultyToSeconds(difficulty: number): number {
  const map: Record<number, number> = {
    1: 120,
    2: 180,
    3: 240,
    4: 300,
    5: 420,
  };
  return map[difficulty] || 240;
}

function parseQuestionMeta(text: string, fallbackTopic: string) {
  const match = text.match(/\*\*技术面试题\*\*\s*\((.+?)\s*\|\s*难度:\s*(★+)/);
  const difficulty = match ? match[2].length : 3;
  const topic = match ? match[1].trim() : fallbackTopic;
  const timeMatch = text.match(/\[time\]\s*(\d+)/);
  const timeLimit = timeMatch
    ? parseInt(timeMatch[1])
    : difficultyToSeconds(difficulty);
  return { topic, difficulty, timeLimit };
}

export async function techSelectNode(state: any): Promise<any> {
  const { techRound, position, candidate } = state;
  const projects = candidate.projects || [];
  const skills = candidate.skills || [];
  const askedCount = (techRound.questionsAsked || []).length;

  const maxProjectQuestions = projects.length;
  const maxTotalQuestions = maxProjectQuestions + 2;
  console.log("🚀 ~ techSelectNode ~ state:", state);

  if (askedCount >= maxTotalQuestions) {
    return { currentStage: "behavioral" };
  }

  // Phase 1: 项目经历深挖
  if (askedCount < maxProjectQuestions) {
    const project = projects[askedCount];
    const highlights = (project.highlights || []).join("\n- ");

    const { content } = await executePersona(
      techInterviewerPersona,
      new HumanMessage(
        `【岗位信息】${position.title} | ${position.department} | 级别: ${position.level || "未指定"}
【岗位JD】${position.jdText}
【候选人项目】${project.name}（${project.summary}）
【主要工作】
- ${highlights}
${state.candidateIntro ? `【自我介绍】${state.candidateIntro}` : ""}`,
      ),
    );

    const { topic, difficulty, timeLimit } = parseQuestionMeta(
      content,
      project.name,
    );

    return {
      messages: [new AIMessage(content)],
      techRound: {
        ...techRound,
        currentQuestion: {
          text: content,
          type: "technical",
          topic,
          difficulty,
          timeLimit,
        },
        currentTopic: topic,
        depth: 0,
      },
    };
  }

  // Phase 2: 技能基础
  const conceptIndex = askedCount - maxProjectQuestions;
  const skillCats = skills.map((s: any) => s.category).filter(Boolean);
  const conceptTopic = skillCats[conceptIndex] || "技术基础";

  const { content } = await executePersona(
    techConceptInterviewerPersona,
    new HumanMessage(
      `【岗位信息】${position.title} | ${position.department} | 级别: ${position.level || "未指定"}
【岗位JD】${position.jdText}
【候选人技能分类】${conceptTopic}
【技能详情】${skills.flatMap((s: any) => s.items || [s]).join(", ")}
${state.candidateIntro ? `【自我介绍】${state.candidateIntro}` : ""}`,
    ),
  );

  const { topic, difficulty, timeLimit } = parseQuestionMeta(
    content,
    conceptTopic,
  );

  return {
    messages: [new AIMessage(content)],
    techRound: {
      ...techRound,
      currentQuestion: {
        text: content,
        type: "technical",
        topic,
        difficulty,
        timeLimit,
      },
      currentTopic: topic,
      depth: 0,
    },
  };
}

export async function techAskNode(_state: any): Promise<any> {
  return {};
}

export async function techEvaluateNode(state: any): Promise<any> {
  const question = state.techRound.currentQuestion;
  const candidateAnswer = state.candidateAnswer || "";

  if (!question) {
    return { candidateAnswer: "", currentStage: "behavioral" };
  }

  if (!candidateAnswer.trim()) {
    interrupt({ type: "waiting_for_answer" });
    return {};
  }

  const questionText =
    typeof question.text === "string" && question.text.length > 200
      ? question.text.substring(0, 200)
      : question.text || "";

  const { response: evaluation } = await executePersona(
    techEvaluatorPersona,
    new HumanMessage(`题目: ${questionText}\n候选人回答: ${candidateAnswer}`),
  );

  const scores = { ...state.scores };
  scores.technical = (scores.technical || 0) + evaluation.score;

  return {
    answerHistory: [
      {
        stage: "technical",
        question: state.techRound.currentQuestion,
        answer: candidateAnswer,
        evaluation,
      },
    ],
    scores,
    candidateAnswer: "",
  };
}

export async function techFollowUpNode(state: any): Promise<any> {
  const question = state.techRound.currentQuestion;
  if (!question) return { currentStage: "behavioral" };
  const answerHistory = state.answerHistory || [];
  const lastEval = answerHistory[answerHistory.length - 1]?.evaluation || {};
  const lastAnswer = answerHistory[answerHistory.length - 1]?.answer || "";

  const followupPersona = {
    ...techFollowupPersona,
    systemPrompt:
      techFollowupPersona.systemPrompt +
      `\n追问深度：第${(state.techRound.depth || 0) + 1}层追问。`,
  };

  const { content } = await executePersona(
    followupPersona,
    new HumanMessage(
      `原题: ${question.text}\n回答: ${lastAnswer}\n评估: ${JSON.stringify(lastEval)}`,
    ),
  );

  return {
    messages: [new AIMessage(content || "请再详细说说...")],
    techRound: {
      ...state.techRound,
      depth: (state.techRound.depth || 0) + 1,
    },
  };
}

export async function techNextTopicNode(state: any): Promise<any> {
  const prevQuestion = state.techRound.currentQuestion;
  const questionsAsked = prevQuestion
    ? [...(state.techRound.questionsAsked || []), prevQuestion]
    : state.techRound.questionsAsked || [];

  return {
    techRound: {
      ...state.techRound,
      currentQuestion: null,
      questionsAsked,
      depth: 0,
    },
  };
}
