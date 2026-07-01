import type { Ref } from "vue";
import type { SSEHandlers } from "@/api";
import type { ChatMessage } from "@/types";

export interface StageLogItem {
  label: string;
  time: string;
  type: "completed" | "active";
}

export interface EvaluationItem {
  questionText: string;
  score: number;
  summary: string;
  stage: string;
}

interface TimerControls {
  tryStartTimer: (text: string) => void;
  stopAllTimers: () => void;
}

interface InterviewSSEHandlerContext {
  messages: Ref<ChatMessage[]>;
  currentStage: Ref<string>;
  statusText: Ref<string>;
  report: Ref<any>;
  stageLog: Ref<StageLogItem[]>;
  evaluations: Ref<EvaluationItem[]>;
  timer: TimerControls;
  addMessage: (role: string, content: string, stage?: string) => void;
  hasSameLastMessage: (role: string, content: string, stage?: string) => boolean;
}

const stageLabelMap: Record<string, string> = {
  icebreaker: "自我介绍",
  parse_resume: "简历解析",
  technical: "技术面",
  behavioral: "行为面",
  qa: "反问",
  candidate_qa: "反问",
  done: "完成",
};

function stageLabel(stage: string): string {
  return stageLabelMap[stage] || stage;
}

function currentTime(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function completeActiveStages(stageLog: Ref<StageLogItem[]>) {
  stageLog.value.forEach((item) => {
    if (item.type === "active") item.type = "completed";
  });
}

function addStageLog(
  stageLog: Ref<StageLogItem[]>,
  label: string,
  type: StageLogItem["type"],
  time = currentTime(),
) {
  stageLog.value.push({ label, time, type });
}

function addWaitingLog(stageLog: Ref<StageLogItem[]>) {
  addStageLog(stageLog, "等待用户回答...", "active", "");
}

export function buildInterviewSSEHandlers(
  ctx: InterviewSSEHandlerContext,
  onEvent?: (data: any) => void,
): SSEHandlers {
  let streamingMsgId: string | null = null;

  return {
    onEvent,

    onStatus: (content) => {
      ctx.statusText.value = content;
      if (
        content &&
        !ctx.stageLog.value.some(
          (item) => item.label === content && item.type === "active",
        )
      ) {
        completeActiveStages(ctx.stageLog);
        addStageLog(ctx.stageLog, content, "active");
      }
    },

    onToken: (content) => {
      if (!streamingMsgId) {
        streamingMsgId = Date.now().toString();
        ctx.messages.value.push({
          id: streamingMsgId,
          role: "interviewer",
          content,
          stage: "",
          timestamp: Date.now(),
          streaming: true,
        });
        return streamingMsgId;
      }

      const msg = ctx.messages.value.find((item) => item.id === streamingMsgId);
      if (msg) msg.content += content;
      return null;
    },

    onTokenEnd: () => {
      if (streamingMsgId) {
        const msg = ctx.messages.value.find((item) => item.id === streamingMsgId);
        if (msg) {
          msg.streaming = false;
          ctx.timer.tryStartTimer(msg.content);
        }
        streamingMsgId = null;
      }
      ctx.statusText.value = "";
      completeActiveStages(ctx.stageLog);
      addWaitingLog(ctx.stageLog);
    },

    onEvaluation: (data) => {
      const ev = data.data || {};
      ctx.evaluations.value.push({
        questionText: ev.questionText || ev.question || "",
        score: ev.score || 0,
        summary: ev.summary || "",
        stage: data.stage || ctx.currentStage.value,
      });
      completeActiveStages(ctx.stageLog);
      addStageLog(ctx.stageLog, `评估完成 (${ev.score}/10)`, "completed");
      ctx.statusText.value = "";
    },

    onMessage: (content, stage) => {
      if (!ctx.hasSameLastMessage("interviewer", content, stage)) {
        ctx.addMessage("interviewer", content, stage);
      }
      ctx.currentStage.value = stage || ctx.currentStage.value;
      ctx.timer.tryStartTimer(content);
      ctx.statusText.value = "";
      if (stage) {
        completeActiveStages(ctx.stageLog);
        addStageLog(ctx.stageLog, `${stageLabel(stage)}阶段`, "completed");
      }
      addWaitingLog(ctx.stageLog);
    },

    onStage: (stage) => {
      ctx.currentStage.value = stage;
      completeActiveStages(ctx.stageLog);
      addStageLog(ctx.stageLog, `进入${stageLabel(stage)}阶段`, "active");
    },

    onDone: (reportData) => {
      ctx.report.value = reportData;
      ctx.currentStage.value = "done";
      ctx.timer.stopAllTimers();
      completeActiveStages(ctx.stageLog);
      addStageLog(ctx.stageLog, "面试完成", "completed");
    },

    onWarning: (message, data) => {
      const providerInfo = data?.model
        ? ` [${data.providerId || "default"} / ${data.model}]`
        : "";
      const displayMessage = `${message || ""}${providerInfo}`;
      console.warn("LLM warning:", data || message);
      ctx.statusText.value = displayMessage || ctx.statusText.value;
      if (
        displayMessage &&
        !ctx.stageLog.value.some(
          (item) => item.label === displayMessage && item.type === "active",
        )
      ) {
        completeActiveStages(ctx.stageLog);
        addStageLog(ctx.stageLog, displayMessage, "active");
      }
    },

    onError: (message) => {
      console.error("Stream error:", message);
      ctx.addMessage("system", `错误: ${message}`);
    },
  };
}
