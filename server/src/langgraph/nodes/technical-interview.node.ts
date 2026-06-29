import { HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { pushEvent } from "../llm";
import { executePersona } from "../personas/persona-executor";
import {
  techInterviewerPersona,
  techConceptInterviewerPersona,
} from "../personas/tech-interviewer.persona";
import { techEvaluatorPersona } from "../personas/tech-evaluator.persona";
import { techFollowupPersona } from "../personas/tech-followup.persona";
import { secureJsonData, securePromptData } from "../prompt-security";

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

export async function askTechnicalQuestionNode(state: any): Promise<any> {
  const { techRound, position, candidate } = state;
  const projects = candidate.projects || [];
  const skills = candidate.skills || [];
  const askedCount = (techRound.questionsAsked || []).length;

  const maxProjectQuestions = projects.length;

  // Phase 1: 项目经历深挖
  if (askedCount < maxProjectQuestions) {
    const project = projects[askedCount];
    const highlights = (project.highlights || []).join("\n- ");

    const { content } = await executePersona(
      techInterviewerPersona,
      new HumanMessage(
        `【岗位信息】
${securePromptData("position", `${position.title} | ${position.department} | 级别: ${position.level || "未指定"}`)}
【岗位JD】
${securePromptData("jd", position.jdText)}
【候选人项目】
${secureJsonData("candidate_project", project)}
【主要工作】
${securePromptData("project_highlights", highlights)}
${state.candidateIntro ? `【自我介绍】\n${securePromptData("candidate_intro", state.candidateIntro)}` : ""}`,
      ),
    );

    const { topic, difficulty, timeLimit } = parseQuestionMeta(
      content,
      project.name,
    );

    return {
      currentStage: "technical",
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

  // 汇总已覆盖的话题，避免重复出题
  const answerHistory = state.answerHistory || [];
  const coveredTopics = [
    ...new Set(answerHistory.map((r: any) => r.question?.topic).filter(Boolean)),
  ];

  const { content } = await executePersona(
    techConceptInterviewerPersona,
    new HumanMessage(
      `【岗位信息】
${securePromptData("position", `${position.title} | ${position.department} | 级别: ${position.level || "未指定"}`)}
【岗位JD】
${securePromptData("jd", position.jdText)}
【候选人技能分类】
${securePromptData("skill_category", conceptTopic)}
【技能详情】
${secureJsonData("skills", skills)}
${coveredTopics.length ? `【已覆盖话题】\n${secureJsonData("covered_topics", coveredTopics)}\n请避开这些话题` : ""}
${state.candidateIntro ? `【自我介绍】\n${securePromptData("candidate_intro", state.candidateIntro)}` : ""}`,
    ),
  );

  const { topic, difficulty, timeLimit } = parseQuestionMeta(
    content,
    conceptTopic,
  );

  return {
    currentStage: "technical",
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

export async function evaluateTechnicalAnswerNode(state: any): Promise<any> {
  const question = state.techRound.currentQuestion;
  const candidateAnswer = state.candidateAnswer || "";

  if (!question) {
    pushEvent({ type: "stage", stage: "behavioral" });
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
    new HumanMessage(`题目:
${securePromptData("question", questionText)}

候选人回答:
${securePromptData("candidate_answer", candidateAnswer)}`),
  );

  const scores = { ...state.scores };
  scores.technical = (scores.technical || 0) + evaluation.score;

  pushEvent({ type: "evaluation", data: evaluation, stage: "technical" });

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

export async function askTechnicalFollowUpNode(state: any): Promise<any> {
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
      `原题:
${securePromptData("question", question.text)}

回答:
${securePromptData("candidate_answer", lastAnswer)}

评估:
${secureJsonData("evaluation", lastEval)}`,
    ),
  );

  const followUpText = content || "请再详细说说...";
  // 从 LLM 输出中解析难度星级和 [time]，格式与技术出题节点一致
  const starMatch = followUpText.match(/\*\*.+?\*\*\s*\(.+?\s*\|\s*难度:\s*(★+)/);
  const difficulty = starMatch ? starMatch[1].length : question.difficulty;
  const timeMatch = followUpText.match(/\[time\]\s*(\d+)/);
  const timeLimit = timeMatch ? parseInt(timeMatch[1]) : difficultyToSeconds(difficulty);

  return {
    currentStage: "technical",
    techRound: {
      ...state.techRound,
      currentQuestion: {
        ...question,
        text: followUpText,
        difficulty,
        timeLimit,
      },
      depth: (state.techRound.depth || 0) + 1,
    },
  };
}

export async function advanceTechnicalTopicNode(state: any): Promise<any> {
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
