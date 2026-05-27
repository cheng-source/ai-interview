<template>
  <div :class="['chat-bubble', message.role]">
    <div class="bubble-header">
      <span class="role-badge">{{ message.role === 'interviewer' ? 'AI 面试官' : '你' }}</span>
      <span class="stage-badge" v-if="message.stage">{{ message.stage }}</span>
    </div>
    <div class="bubble-content" v-html="renderMarkdown(message.content)" />
    <div class="bubble-time">{{ formatTime(message.timestamp) }}</div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '../types';

const props = defineProps<{ message: ChatMessage }>();

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n- /g, '<br>- ')
    .replace(/\n/g, '<br>');
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN');
}
</script>

<style scoped>
.chat-bubble {
  max-width: 80%; padding: 12px 16px; border-radius: 12px; margin-bottom: 12px;
}
.chat-bubble.interviewer {
  align-self: flex-start; background: #1e293b; border: 1px solid #334155;
}
.chat-bubble.candidate {
  align-self: flex-end; background: #0d3b66; border: 1px solid #1e5a8a; margin-left: auto;
}
.bubble-header { display: flex; gap: 8px; margin-bottom: 6px; }
.role-badge { font-size: 11px; color: #94a3b8; }
.stage-badge { font-size: 10px; background: #334155; padding: 1px 6px; border-radius: 4px; color: #94a3b8; }
.bubble-content { line-height: 1.7; color: #e2e8f0; }
.bubble-time { font-size: 10px; color: #64748b; margin-top: 6px; text-align: right; }
</style>
