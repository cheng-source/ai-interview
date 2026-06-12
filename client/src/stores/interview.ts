import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatMessage } from "../types";
import { useInterviewTimer } from "@/composables/useTimer";
import { interviewApi, readSSEStream, type SSEHandlers } from "../api";

const stageLabelMap: Record<string, string> = {
  icebreaker: '自我介绍', technical: '技术面', behavioral: '行为面', qa: '反问', done: '完成',
};
function stageLabel(s: string): string { return stageLabelMap[s] || s; }

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
  const stageLog = ref<Array<{ label: string; time: string; type: 'completed' | 'active' }>>([]);
  const evaluations = ref<Array<{ questionText: string; score: number; summary: string; stage: string }>>([]);
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

  /** 构建 SSE 事件处理器（捕获 store 的响应式状态） */
  function buildSSEHandlers(onEvent?: (data: any) => void): SSEHandlers {
    let streamingMsgId: string | null = null;

    return {
      onEvent,

      onStatus: (content) => {
        statusText.value = content;
        if (content && !stageLog.value.some(s => s.label === content && s.type === 'active')) {
          stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
          stageLog.value.push({ label: content, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'active' });
        }
      },

      onToken: (content) => {
        if (!streamingMsgId) {
          streamingMsgId = Date.now().toString();
          messages.value.push({
            id: streamingMsgId,
            role: "interviewer",
            content,
            stage: "",
            timestamp: Date.now(),
            streaming: true,
          });
          return streamingMsgId;
        } else {
          const msg = messages.value.find((m) => m.id === streamingMsgId);
          if (msg) msg.content += content;
          return null;
        }
      },

      onTokenEnd: () => {
        if (streamingMsgId) {
          const msg = messages.value.find((m) => m.id === streamingMsgId);
          if (msg) {
            msg.streaming = false;
            timer.tryStartTimer(msg.content);
          }
          streamingMsgId = null;
        }
        statusText.value = "";
        stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
        stageLog.value.push({ label: '等待用户回答...', time: '', type: 'active' });
      },

      onEvaluation: (data) => {
        const ev = data.data || {};
        evaluations.value.push({
          questionText: ev.questionText || ev.question || '',
          score: ev.score || 0,
          summary: ev.summary || '',
          stage: data.stage || currentStage.value,
        });
        stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
        stageLog.value.push({ label: `评估完成 (${ev.score}/10)`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'completed' });
        statusText.value = "";
      },

      onMessage: (content, stage) => {
        if (!hasSameLastMessage("interviewer", content, stage)) {
          addMessage("interviewer", content, stage);
        }
        currentStage.value = stage || currentStage.value;
        timer.tryStartTimer(content);
        statusText.value = "";
        if (stage) {
          stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
          stageLog.value.push({ label: `${stageLabel(stage)}阶段`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'completed' });
        }
        stageLog.value.push({ label: '等待用户回答...', time: '', type: 'active' });
      },

      onStage: (stage) => {
        currentStage.value = stage;
        stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
        stageLog.value.push({ label: `进入${stageLabel(stage)}阶段`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'active' });
      },

      onDone: (reportData) => {
        report.value = reportData;
        currentStage.value = "done";
        timer.stopAllTimers();
        stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
        stageLog.value.push({ label: '面试完成', time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'completed' });
      },

      onWarning: (message) => {
        console.warn("LLM warning:", message);
        statusText.value = message || statusText.value;
        if (message && !stageLog.value.some(s => s.label === message && s.type === 'active')) {
          stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
          stageLog.value.push({ label: message, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'active' });
        }
      },

      onError: (message) => {
        console.error("Stream error:", message);
        addMessage("system", `错误: ${message}`);
      },
    };
  }

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
      await readSSEStream(res, buildSSEHandlers((data) => {
        if (["message", "token", "error", "done"].includes(data.type)) markReady();
      }));
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Start interview error:", e);
        addMessage("system", "启动面试失败，请重试");
      }
    } finally {
      markReady();
      abortFn = null;
      isConnected.value = true;
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
      await readSSEStream(res, buildSSEHandlers((data) => {
        if (["message", "token", "error", "done"].includes(data.type)) markReady();
      }));
    } catch (e: any) {
      if (e.name !== "AbortError") {
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
      await readSSEStream(res, buildSSEHandlers());
    } catch (e: any) {
      if (e.name !== "AbortError") {
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
