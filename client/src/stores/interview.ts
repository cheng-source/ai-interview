import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatMessage } from "../types";
import { useInterviewTimer } from "@/composables/useTimer";
import { interviewApi, readSSEStream } from "../api";
import {
  buildInterviewSSEHandlers,
  type EvaluationItem,
  type StageLogItem,
} from "./interview/sse-handlers";

function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useInterviewStore = defineStore("interview", () => {
  const messages = ref<ChatMessage[]>([]);
  const currentStage = ref("");
  const interviewType = ref("technical");
  const interviewToken = ref("");
  const statusText = ref("");
  const interviewId = ref("");
  const isConnected = ref(false);
  const report = ref<any>(null);
  const stageLog = ref<StageLogItem[]>([]);
  const evaluations = ref<EvaluationItem[]>([]);
  let abortFn: (() => void) | null = null;

  const timer = useInterviewTimer();

  const addMessage = (role: string, content: string, stage?: string) => {
    messages.value.push({
      id: Date.now().toString(),
      role: role as ChatMessage["role"],
      content,
      stage: stage || "",
      timestamp: Date.now(),
    });
  };

  const addSystemMessage = (content: string) => addMessage("system", content);

  const setInterviewToken = (token: string) => {
    interviewToken.value = token;
  };

  const hasSameLastMessage = (role: string, content: string, stage?: string) => {
    const last = messages.value[messages.value.length - 1];
    return !!last
      && last.role === role
      && last.content.trim() === content.trim()
      && (last.stage || "") === (stage || "");
  };

  const buildSSEHandlers = (onEvent?: (data: any) => void) =>
    buildInterviewSSEHandlers(
      {
        messages,
        currentStage,
        statusText,
        report,
        stageLog,
        evaluations,
        timer,
        addMessage,
        hasSameLastMessage,
      },
      onEvent,
    );

  const startInterview = async (id: string, resumeText: string, onReady?: () => void) => {
    interviewId.value = id;
    timer.startTotalTimer();
    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReady?.();
    };

    const { response, abort } = interviewApi.startStream(id, resumeText, interviewToken.value || undefined);
    abortFn = abort;

    try {
      const res = await response;
      isConnected.value = true;
      await readSSEStream(res, buildSSEHandlers((data) => {
        if (["message", "token", "error", "done"].includes(data.type)) markReady();
      }));
    } catch (e: any) {
      if (e.name !== "AbortError") {
        isConnected.value = false;
        console.error("Start interview error:", e);
        addMessage("system", "启动面试失败，请重试");
      }
    } finally {
      markReady();
      abortFn = null;
    }
  };

  const sendAnswer = async (answer: string, onReady?: () => void) => {
    timer.stopQuestionTimer();
    addMessage("candidate", answer, currentStage.value);
    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReady?.();
    };

    const { response, abort } = interviewApi.sendMessage(
      interviewId.value, answer, createClientMessageId(), interviewToken.value || undefined,
    );
    abortFn = abort;

    try {
      const res = await response;
      isConnected.value = true;
      await readSSEStream(res, buildSSEHandlers((data) => {
        if (["message", "token", "error", "done"].includes(data.type)) markReady();
      }));
    } catch (e: any) {
      if (e.name !== "AbortError") {
        isConnected.value = false;
        console.error("Send answer error:", e);
        addMessage("system", "发送失败，请重试");
      }
    } finally {
      markReady();
      abortFn = null;
    }
  };

  const resumeStream = async (id: string) => {
    interviewId.value = id;

    const { response, abort } = interviewApi.resumeStream(id, interviewToken.value || undefined);
    abortFn = abort;

    try {
      const res = await response;
      isConnected.value = true;
      await readSSEStream(res, buildSSEHandlers());
    } catch (e: any) {
      if (e.name !== "AbortError") {
        isConnected.value = false;
        console.error("Resume stream error:", e);
      }
    } finally {
      abortFn = null;
    }
  };

  const cleanup = () => {
    abortFn?.();
    abortFn = null;
    timer.stopAllTimers();
    messages.value = [];
    currentStage.value = "";
    statusText.value = "";
    interviewId.value = "";
    interviewToken.value = "";
    isConnected.value = false;
    report.value = null;
    stageLog.value = [];
    evaluations.value = [];
  };

  return {
    messages,
    currentStage,
    interviewType,
    statusText,
    interviewId,
    isConnected,
    report,
    stageLog,
    evaluations,
    questionTimeRemaining: timer.questionTimeRemaining,
    totalElapsed: timer.totalElapsed,
    onTimeout: timer.onTimeout,
    startQuestionTimer: timer.startQuestionTimer,
    startTotalTimer: timer.startTotalTimer,
    stopAllTimers: timer.stopAllTimers,
    startInterview,
    sendAnswer,
    resumeStream,
    addMessage,
    setInterviewToken,
    cleanup,
    addSystemMessage,
  };
});
