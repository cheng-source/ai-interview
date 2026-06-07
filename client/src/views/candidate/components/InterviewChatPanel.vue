<template>
  <div class="flex flex-col h-screen bg-gray-50">
    <div class="flex items-center justify-between pr-4 bg-white border-b border-gray-200">
      <ProgressIndicator
        :currentStage="store.currentStage"
        :interviewType="store.interviewType"
      />
      <span class="text-xs text-gray-500 whitespace-nowrap tabular-nums">
        已用时 {{ formatElapsed(store.totalElapsed) }}
      </span>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <div class="flex-1 flex flex-col overflow-hidden">
        <div ref="chatRef" class="flex-1 overflow-y-auto p-5 flex flex-col">
          <ChatBubble
            v-for="msg in store.messages"
            :key="msg.id"
            :message="msg"
          />
          <div
            v-if="store.statusText"
            class="flex items-center gap-2 max-w-[80%] px-4 py-2.5 rounded-xl mb-3 self-start bg-gray-100 border border-gray-200 text-gray-500 text-[13px]"
          >
            <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            AI 正在思考中...
          </div>
          <div v-if="store.currentStage === 'done'" class="text-center py-5 text-green-500 text-base mt-6">
            面试完成
          </div>
        </div>

        <form
          v-if="store.currentStage !== 'done'"
          class="flex gap-2 p-3 bg-white border-t border-gray-200"
          @submit.prevent="submit"
        >
          <div class="flex-1 flex flex-col">
            <textarea
              ref="inputRef"
              v-model="draft"
              placeholder="描述你的思路... (Enter 发送，Shift+Enter 换行)"
              class="flex-1 p-2.5 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none resize-none text-sm leading-relaxed min-h-11 max-h-[30vh] focus:border-blue-400 overflow-y-auto"
              :disabled="sending"
              @keydown.enter.exact.prevent="submit"
              @input="autoResize"
            />
            <div
              v-if="store.questionTimeRemaining > 0"
              :class="[
                'text-xs mt-1 tabular-nums',
                store.questionTimeRemaining <= 30 ? 'text-red-500 font-semibold' : 'text-blue-500',
              ]"
            >
              剩余 {{ formatElapsed(store.questionTimeRemaining) }}
            </div>
          </div>
          <el-button
            type="primary"
            native-type="submit"
            :disabled="!draft.trim() || sending"
            :loading="sending"
          >
            {{ sending ? "发送中..." : "发送" }}
          </el-button>
        </form>
      </div>

      <InterviewSidebar v-if="store.currentStage !== 'done'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import ChatBubble from "../../../components/ChatBubble.vue";
import InterviewSidebar from "../../../components/InterviewSidebar.vue";
import ProgressIndicator from "../../../components/ProgressIndicator.vue";
import type { useInterviewStore } from "../../../stores/interview";
import { formatElapsed } from "../format";

const props = defineProps<{
  store: ReturnType<typeof useInterviewStore>;
  sending: boolean;
}>();

const emit = defineEmits<{
  send: [value: string];
}>();

const draft = ref("");
const inputRef = ref<HTMLTextAreaElement | null>(null);
const chatRef = ref<HTMLElement | null>(null);

function autoResize() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function scrollToBottom() {
  if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight;
}

async function submit() {
  const text = draft.value.trim();
  if (!text || props.sending) return;
  draft.value = "";
  autoResize();
  emit("send", text);
}

function consumeDraft(): string {
  const text = draft.value.trim();
  draft.value = "";
  autoResize();
  return text;
}

watch(
  () => {
    const messages = props.store.messages;
    if (messages.length === 0) return "";
    const last = messages[messages.length - 1];
    return `${messages.length}:${last.id}:${last.content.length}`;
  },
  () => {
    nextTick(() => scrollToBottom());
  },
);

defineExpose({
  consumeDraft,
  scrollToBottom,
});
</script>
