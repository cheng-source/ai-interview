<template>
  <div class="interview-page">
    <ProgressIndicator :currentStage="store.currentStage" />
    <div class="chat-area" ref="chatRef">
      <ChatBubble v-for="msg in store.messages" :key="msg.id" :message="msg" />
      <div v-if="store.currentStage === 'done'" class="done-banner">
        ✓ 面试完成
      </div>
    </div>
    <div class="input-area" v-if="store.currentStage !== 'done'">
      <textarea
        v-model="userInput"
        @keydown.enter.exact.prevent="handleSend"
        placeholder="输入你的回答... (Enter 发送)"
        class="input-box"
        :disabled="sending"
      />
      <button @click="handleSend" :disabled="!userInput.trim() || sending" class="btn-send">
        {{ sending ? '发送中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useInterviewStore } from '../../stores/interview';
import ChatBubble from '../../components/ChatBubble.vue';
import ProgressIndicator from '../../components/ProgressIndicator.vue';

const route = useRoute();
const store = useInterviewStore();
const interviewId = route.params.interviewId as string;
const userInput = ref('');
const sending = ref(false);
const chatRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  await store.startInterview(interviewId, '简历将在此处解析');
  scrollToBottom();
});

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  userInput.value = '';
  await store.sendAnswer(text);
  sending.value = false;
  await nextTick();
  scrollToBottom();
}

function scrollToBottom() {
  if (chatRef.value) {
    chatRef.value.scrollTop = chatRef.value.scrollHeight;
  }
}

onUnmounted(() => {
  store.cleanup();
});
</script>

<style scoped>
.interview-page {
  display: flex; flex-direction: column; height: 100vh;
  background: #0f172a; color: #e2e8f0;
}
.chat-area {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column;
}
.input-area {
  display: flex; gap: 8px; padding: 12px 20px; background: #1e293b; border-top: 1px solid #334155;
}
.input-box {
  flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid #334155;
  background: #0f172a; color: #e2e8f0; outline: none; resize: none; min-height: 44px;
  font-size: 14px; line-height: 1.5;
}
.btn-send {
  padding: 8px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px;
  cursor: pointer; font-size: 14px; white-space: nowrap;
}
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
.done-banner {
  text-align: center; padding: 20px; color: #22c55e; font-size: 16px; margin-top: 24px;
}
</style>
