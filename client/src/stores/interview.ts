import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage } from '../types';
import { interviewsApi, createSSEConnection } from '../api/client';

export const useInterviewStore = defineStore('interview', () => {
  const messages = ref<ChatMessage[]>([]);
  const currentStage = ref('');
  const interviewId = ref('');
  const isConnected = ref(false);
  const report = ref<any>(null);
  let eventSource: EventSource | null = null;

  const addMessage = (role: string, content: string, stage?: string) => {
    messages.value.push({
      id: Date.now().toString(),
      role: role as ChatMessage['role'],
      content,
      stage: stage || '',
      timestamp: Date.now(),
    });
  };

  const startInterview = async (id: string, resumeText: string) => {
    interviewId.value = id;
    await interviewsApi.start(id, resumeText);

    const url = interviewsApi.getStreamUrl(id);
    eventSource = createSSEConnection(url, (data) => {
      if (data.type === 'message') {
        addMessage('interviewer', data.content, data.stage);
        currentStage.value = data.stage || currentStage.value;
      } else if (data.type === 'done') {
        report.value = data.report;
        currentStage.value = 'done';
        eventSource?.close();
      }
    });

    isConnected.value = true;
  };

  const sendAnswer = async (answer: string) => {
    addMessage('candidate', answer, currentStage.value);

    const res = await interviewsApi.sendMessage(interviewId.value, answer);
    for (const event of res.data) {
      if (event.type === 'message') {
        addMessage('interviewer', event.content, event.stage);
        currentStage.value = event.stage || currentStage.value;
      } else if (event.type === 'done') {
        report.value = event.report;
        currentStage.value = 'done';
      }
    }
  };

  const cleanup = () => {
    eventSource?.close();
    eventSource = null;
    messages.value = [];
    currentStage.value = '';
    interviewId.value = '';
    isConnected.value = false;
    report.value = null;
  };

  return {
    messages, currentStage, interviewId, isConnected, report,
    startInterview, sendAnswer, addMessage, cleanup,
  };
});
