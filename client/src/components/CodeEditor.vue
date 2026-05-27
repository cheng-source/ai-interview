<template>
  <div class="code-editor">
    <div class="editor-header">
      <span>代码编辑器 ({{ language }})</span>
    </div>
    <textarea
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      :placeholder="placeholder"
      class="editor-area"
      spellcheck="false"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  language?: string;
  placeholder?: string;
}>();
defineEmits<['update:modelValue']>();
</script>

<style scoped>
.code-editor { border: 1px solid #334155; border-radius: 8px; overflow: hidden; margin: 8px 0; }
.editor-header { background: #1e293b; padding: 6px 12px; font-size: 11px; color: #64748b; }
.editor-area {
  width: 100%; min-height: 200px; padding: 12px; background: #0f172a; color: #e2e8f0;
  border: none; outline: none; resize: vertical; font-family: 'Fira Code', monospace;
  font-size: 13px; line-height: 1.6; tab-size: 2;
}
.editor-area::placeholder { color: #475569; }
</style>
