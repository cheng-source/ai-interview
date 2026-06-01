<template>
  <div class="border border-gray-200 rounded-lg overflow-hidden my-2">
    <div class="bg-gray-100 px-3 py-1.5 text-[11px] text-gray-500">代码编辑器 ({{ language }})</div>
    <textarea
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      :placeholder="placeholder"
      class="w-full min-h-[200px] p-3 bg-white text-gray-800 border-none outline-none resize-y font-mono text-[13px] leading-relaxed"
      spellcheck="false"
    />
  </div>
</template>
<script setup lang="ts">
defineProps<{ modelValue: string; language?: string; placeholder?: string }>();
defineEmits<['update:modelValue']>();
</script>
