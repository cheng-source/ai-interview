import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatMessage } from "../types";
import { useInterviewTimer } from "./timer";

const stageLabelMap: Record<string, string> = {
  icebreaker: '自我介绍', technical: '技术面', behavioral: '行为面', qa: '反问', done: '完成',
};
function stageLabel(s: string): string { return stageLabelMap[s] || s; }

export const useInterviewStore = defineStore("interview", () => {
  const messages = ref<ChatMessage[]>([]);
  const currentStage = ref("");
  const interviewType = ref("technical");
  const statusText = ref("");
  const interviewId = ref("");
  const isConnected = ref(false);
  const report = ref<any>(null);
  const stageLog = ref<Array<{ label: string; time: string; type: 'completed' | 'active' }>>([]);
  const evaluations = ref<Array<{ questionText: string; score: number; summary: string; stage: string }>>([]);
  let abortController: AbortController | null = null;

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

  const hasSameLastMessage = (role: string, content: string, stage?: string) => {
    const last = messages.value[messages.value.length - 1];
    return !!last
      && last.role === role
      && last.content.trim() === content.trim()
      && (last.stage || "") === (stage || "");
  };

  async function readSSE(response: Response, onEvent?: (data: any) => void) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamingMsgId: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));
        onEvent?.(data);

        switch (data.type) {
          case "status":
            statusText.value = data.content;
            // 记录到执行时间线（去重：相同标签不重复添加）
            if (data.content && !stageLog.value.some(s => s.label === data.content && s.type === 'active')) {
              // 将之前的 active 项标记为 completed
              stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
              stageLog.value.push({ label: data.content, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'active' });
            }
            break;

          case "token": {
            if (!streamingMsgId) {
              streamingMsgId = Date.now().toString();
              messages.value.push({
                id: streamingMsgId,
                role: "interviewer",
                content: data.content,
                stage: "",
                timestamp: Date.now(),
                streaming: true,
              });
            } else {
              const msg = messages.value.find((m) => m.id === streamingMsgId);
              if (msg) msg.content += data.content;
            }
            statusText.value = "";
            break;
          }

          case "token_end": {
            if (streamingMsgId) {
              const msg = messages.value.find((m) => m.id === streamingMsgId);
              if (msg) {
                msg.streaming = false;
                timer.tryStartTimer(msg.content);
              }
              streamingMsgId = null;
            }
            // AI 输出完毕，等待用户回答
            stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
            stageLog.value.push({ label: '等待用户回答...', time: '', type: 'active' });
            break;
          }

          case "evaluation": {
            const ev = data.data || {};
            evaluations.value.push({
              questionText: ev.questionText || ev.question || '',
              score: ev.score || 0,
              summary: ev.summary || '',
              stage: data.stage || currentStage.value,
            });
            // 将评估添加到时间线
            stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
            stageLog.value.push({ label: `评估完成 (${ev.score}/10)`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'completed' });
            statusText.value = "";
            break;
          }

          case "message":
            if (!hasSameLastMessage("interviewer", data.content, data.stage)) {
              addMessage("interviewer", data.content, data.stage);
            }
            currentStage.value = data.stage || currentStage.value;
            timer.tryStartTimer(data.content);
            statusText.value = "";
            // 记录到时间线
            if (data.stage) {
              stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
              stageLog.value.push({ label: `${stageLabel(data.stage)}阶段`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'completed' });
            }
            // AI 输出完毕，等待用户回答
            stageLog.value.push({ label: '等待用户回答...', time: '', type: 'active' });
            break;

          case "stage":
            currentStage.value = data.stage;
            // 记录阶段切换
            stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
            stageLog.value.push({ label: `进入${stageLabel(data.stage)}阶段`, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'active' });
            break;

          case "done": {
            report.value = data.report;
            currentStage.value = "done";
            timer.stopAllTimers();
            stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
            stageLog.value.push({ label: '面试完成', time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'completed' });
            break;
          }

          case "llm_warning":
            console.warn("LLM warning:", data);
            statusText.value = data.message || statusText.value;
            if (data.message && !stageLog.value.some(s => s.label === data.message && s.type === 'active')) {
              stageLog.value.forEach(s => { if (s.type === 'active') s.type = 'completed'; });
              stageLog.value.push({ label: data.message, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), type: 'active' });
            }
            break;
          case "error":
            console.error("Stream error:", data.message);
            addMessage("system", `错误: ${data.message}`);
            break;
        }
      }
    }

    if (streamingMsgId) {
      const msg = messages.value.find((m) => m.id === streamingMsgId);
      if (msg) msg.streaming = false;
    }
  }

  const startInterview = async (id: string, resumeText: string, onReady?: () => void) => {
    interviewId.value = id;
    abortController = new AbortController();
    timer.startTotalTimer();
    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReady?.();
    };

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'}/interviews/${id}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText }),
          signal: abortController.signal,
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await readSSE(response, (data) => {
        if (["message", "token", "error", "done"].includes(data.type)) markReady();
      });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Start interview error:", e);
        addMessage("system", "启动面试失败，请重试");
      }
    } finally {
      markReady();
      abortController = null;
      isConnected.value = true;
    }
  };

  const sendAnswer = async (answer: string, onReady?: () => void) => {
    timer.stopQuestionTimer();
    addMessage("candidate", answer, currentStage.value);
    abortController = new AbortController();
    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      onReady?.();
    };

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'}/interviews/${interviewId.value}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: answer }),
          signal: abortController.signal,
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await readSSE(response, (data) => {
        if (["message", "token", "error", "done"].includes(data.type)) markReady();
      });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Send answer error:", e);
        addMessage("system", "发送失败，请重试");
      }
    } finally {
      markReady();
      abortController = null;
    }
  };

  const resumeStream = async (id: string) => {
    interviewId.value = id;
    abortController = new AbortController();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'}/interviews/${id}/stream`,
        { signal: abortController.signal },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await readSSE(response);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Resume stream error:", e);
      }
    } finally {
      abortController = null;
    }
  };

  const cleanup = () => {
    abortController?.abort();
    abortController = null;
    timer.stopAllTimers();
    messages.value = [];
    currentStage.value = "";
    statusText.value = "";
    interviewId.value = "";
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
    cleanup,
    addSystemMessage,
  };
});
