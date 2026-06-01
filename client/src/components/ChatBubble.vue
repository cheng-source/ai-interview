<template>
  <div :class="[
    'max-w-[80%] px-4 py-3 rounded-xl mb-3',
    message.role !== 'candidate'
      ? 'self-start bg-gray-100 border border-gray-200'
      : 'self-end bg-blue-50 border border-blue-200 ml-auto'
  ]">
    <div class="flex gap-2 mb-1.5">
      <span class="text-[11px] text-gray-500">{{ message.role !== 'candidate' ? 'AI 面试官' : '你' }}</span>
    </div>
    <div class="leading-relaxed text-gray-800 text-sm" v-html="renderMarkdown(message.content)" />
    <span v-if="message.streaming" class="text-blue-500 font-bold animate-pulse">|</span>
    <div class="text-[10px] text-gray-400 mt-1.5 text-right">{{ formatTime(message.timestamp) }}</div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '../types';
const props = defineProps<{ message: ChatMessage }>();
function renderMarkdown(text: string): string {
  const cleaned = text.replace(/\[time\]\s*\d+/g, '');
  return escapeHtml(cleaned)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n- /g, '<br>- ')
    .replace(/\n/g, '<br>');
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatTime(ts: number): string { return new Date(ts).toLocaleTimeString('zh-CN'); }
</script>
