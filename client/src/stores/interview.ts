import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatMessage } from "../types";
import { useInterviewTimer } from "./timer";

export const useInterviewStore = defineStore("interview", () => {
  const messages = ref<ChatMessage[]>([]);
  const currentStage = ref("");
  const interviewType = ref("technical");
  const statusText = ref("");
  const interviewId = ref("");
  const isConnected = ref(false);
  const report = ref<any>(null);
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

  async function readSSE(response: Response) {
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

        switch (data.type) {
          case "status":
            statusText.value = data.content;
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
            break;
          }

          case "evaluation": {
            const ev = data.data || {};
            addMessage("system", `评分: ${ev.score}/10 — ${ev.summary || ""}`, data.stage);
            statusText.value = "";
            break;
          }

          case "message":
            addMessage("interviewer", data.content, data.stage);
            currentStage.value = data.stage || currentStage.value;
            timer.tryStartTimer(data.content);
            statusText.value = "";
            break;

          case "stage":
            currentStage.value = data.stage;
            break;

          case "done": {
            report.value = data.report;
            currentStage.value = "done";
            timer.stopAllTimers();
            break;
          }

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

  const startInterview = async (id: string, resumeText: string) => {
    interviewId.value = id;
    abortController = new AbortController();
    timer.startTotalTimer();

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
      await readSSE(response);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Start interview error:", e);
        addMessage("system", "启动面试失败，请重试");
      }
    } finally {
      abortController = null;
      isConnected.value = true;
    }
  };

  const sendAnswer = async (answer: string) => {
    timer.stopQuestionTimer();
    addMessage("candidate", answer, currentStage.value);
    abortController = new AbortController();

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
      await readSSE(response);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Send answer error:", e);
        addMessage("system", "发送失败，请重试");
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
  };

  return {
    messages,
    currentStage,
    interviewType,
    statusText,
    interviewId,
    isConnected,
    report,
    questionTimeRemaining: timer.questionTimeRemaining,
    totalElapsed: timer.totalElapsed,
    onTimeout: timer.onTimeout,
    startQuestionTimer: timer.startQuestionTimer,
    startTotalTimer: timer.startTotalTimer,
    stopAllTimers: timer.stopAllTimers,
    startInterview,
    sendAnswer,
    addMessage,
    cleanup,
  };
});
