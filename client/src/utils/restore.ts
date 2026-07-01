import type { ChatMessage } from "../../types";

type RestoredMessage = ChatMessage;

interface BuildRestoreInput {
  state: any;
  interviewId: string;
  startedAt?: string | Date | null;
  now?: number;
  hasActiveStream?: boolean;
}

interface RestoredInterview {
  started: boolean;
  interviewId: string;
  currentStage: string;
  messages: RestoredMessage[];
  evaluations: Array<{ questionText: string; score: number; summary: string; stage: string }>;
  stageLog: Array<{ label: string; time: string; type: "completed" | "active" }>;
  report: any;
  totalElapsed: number;
  questionSeconds: number;
}

const stageLabelMap: Record<string, string> = {
  icebreaker: "自我介绍",
  technical: "技术面",
  behavioral: "行为面",
  qa: "反问",
  candidate_qa: "反问",
  done: "完成",
};

function stageLabel(stage: string): string {
  return stageLabelMap[stage] || stage;
}

function mkMsgId(): string {
  return Date.now().toString() + Math.random();
}

function makeMessage(role: ChatMessage["role"], content: string, stage = ""): RestoredMessage {
  return {
    id: mkMsgId(),
    role,
    content,
    stage,
    timestamp: Date.now(),
    streaming: false,
  };
}

function isSameContent(a?: string, b?: string): boolean {
  return !!a && !!b && a.trim() === b.trim();
}

function pushUniqueMessage(messages: RestoredMessage[], message: RestoredMessage) {
  const last = messages[messages.length - 1];
  if (
    last &&
    last.role === message.role &&
    last.stage === message.stage &&
    isSameContent(last.content, message.content)
  ) {
    return;
  }
  messages.push(message);
}

function parseQuestionSeconds(messages: RestoredMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = messages[i].content.match(/\[time\]\s*(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

function inferPendingQuestion(state: any): { text: string; stage: string } | null {
  const currentStage = state?.currentStage || "";

  if (currentStage === "technical" && state?.techRound?.currentQuestion?.text) {
    return { text: state.techRound.currentQuestion.text, stage: "technical" };
  }

  if (currentStage === "behavioral" && state?.behavioralRound?.currentQuestion?.text) {
    return { text: state.behavioralRound.currentQuestion.text, stage: "behavioral" };
  }

    if ((currentStage === "qa" || currentStage === "candidate_qa") && !state?.candidateAnswer?.trim()) {
    return {
      text:
        (state?.qaCount || 0) === 0
          ? "面试环节已结束，现在是反问环节。你对公司有什么想了解的吗？可以问我关于技术栈、团队架构、企业文化、福利制度、职业发展等方面的问题。"
          : "还有其他想了解的吗？",
      stage: "candidate_qa",
    };
  }

  if (state?.techRound?.currentQuestion?.text) {
    return { text: state.techRound.currentQuestion.text, stage: "technical" };
  }

  if (state?.behavioralRound?.currentQuestion?.text) {
    return { text: state.behavioralRound.currentQuestion.text, stage: "behavioral" };
  }

  return null;
}

function buildMessagesAndEvaluations(state: any, includePendingQuestion: boolean) {
  const messages: RestoredMessage[] = [];
  const evaluations: RestoredInterview["evaluations"] = [];

  for (const record of state?.answerHistory || []) {
    const isCandidateQA = record.stage === "candidate_qa" || record.stage === "qa";

    if (record.question?.text) {
      pushUniqueMessage(messages, makeMessage(isCandidateQA ? "candidate" : "interviewer", record.question.text, record.stage || ""));
    }

    if (record.answer) {
      pushUniqueMessage(messages, makeMessage(isCandidateQA ? "interviewer" : "candidate", record.answer, record.stage || ""));
    }

    if (record.evaluation) {
      evaluations.push({
        questionText: record.question?.text || "",
        score: record.evaluation.score,
        summary: record.evaluation.summary || "",
        stage: record.stage || "",
      });
    }
  }

  if (state?.candidateAnswer?.trim()) {
    const hasCandidateAnswer = messages.some(
      (message) => message.role === "candidate" && isSameContent(message.content, state.candidateAnswer),
    );
    if (!hasCandidateAnswer) {
      messages.push(makeMessage("candidate", state.candidateAnswer, state.currentStage || ""));
    }
  }

  const pending = includePendingQuestion ? inferPendingQuestion(state) : null;
  const lastInterviewer = [...messages].reverse().find((m) => m.role === "interviewer");
  if (pending && !isSameContent(lastInterviewer?.content, pending.text)) {
    messages.push(makeMessage("interviewer", pending.text, pending.stage));
  }

  if (state?.currentStage === "done" && state?.reportText) {
    const alreadyShown = messages.some((m) => isSameContent(m.content, state.reportText));
    if (!alreadyShown) messages.push(makeMessage("interviewer", state.reportText, "done"));
  }

  return { messages, evaluations };
}

function buildStageLog(state: any): RestoredInterview["stageLog"] {
  const log: RestoredInterview["stageLog"] = [];

  if (state?.answerHistory?.length) {
    for (let i = 0; i < state.answerHistory.length; i++) {
      const record = state.answerHistory[i];
      const questionText = record.question?.text || "";
      const shortText = questionText.length > 18 ? `${questionText.slice(0, 18)}...` : questionText;
      if (questionText) log.push({ label: `Q${i + 1}${shortText ? `: ${shortText}` : ""}`, time: "", type: "completed" });
    }
  }

  if (state?.currentStage === "done") {
    log.push({ label: "Interview completed", time: "", type: "completed" });
  } else if (state?.currentStage) {
    log.push({ label: `${stageLabel(state.currentStage)} in progress`, time: "", type: "active" });
  }

  return log;
}

function elapsedFromStartedAt(startedAt: BuildRestoreInput["startedAt"], now: number): number {
  if (!startedAt) return 0;
  const startedTime = new Date(startedAt).getTime();
  if (!Number.isFinite(startedTime)) return 0;
  return Math.max(0, Math.floor((now - startedTime) / 1000));
}

export function buildRestoredInterview(input: BuildRestoreInput): RestoredInterview {
  const { state, interviewId, startedAt, now = Date.now(), hasActiveStream = false } = input;
  const { messages, evaluations } = buildMessagesAndEvaluations(state, !hasActiveStream);
  const hasRestorableState = !!state && (messages.length > 0 || state.currentStage === "done");

  return {
    started: hasRestorableState,
    interviewId,
    currentStage: state?.currentStage || "",
    messages,
    evaluations,
    stageLog: buildStageLog(state),
    report: state?.finalReport || state?.reportText || null,
    totalElapsed: elapsedFromStartedAt(startedAt, now),
    questionSeconds: parseQuestionSeconds(messages),
  };
}
