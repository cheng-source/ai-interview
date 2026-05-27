<template>
  <div class="progress-bar">
    <div
      v-for="stage in stages"
      :key="stage.key"
      :class="['stage', { active: currentStage === stage.key, done: completedStages.has(stage.key) }]"
    >
      <span class="dot" />
      <span class="label">{{ stage.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ currentStage: string }>();

const stageOrder = ['icebreaker', 'technical', 'behavioral', 'qa', 'done'];
const stages = [
  { key: 'icebreaker', label: '破冰' },
  { key: 'technical', label: '技术面' },
  { key: 'behavioral', label: '行为面' },
  { key: 'qa', label: '反问' },
  { key: 'done', label: '完成' },
];

const completedStages = computed(() => {
  const idx = stageOrder.indexOf(props.currentStage);
  return new Set(idx >= 0 ? stageOrder.slice(0, idx) : []);
});
</script>

<style scoped>
.progress-bar { display: flex; gap: 0; align-items: center; padding: 8px 16px; background: #0f172a; }
.stage { display: flex; align-items: center; gap: 4px; opacity: 0.3; flex: 1; }
.stage.active { opacity: 1; }
.stage.done { opacity: 0.7; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #475569; }
.stage.active .dot { background: #3b82f6; }
.stage.done .dot { background: #22c55e; }
.label { font-size: 10px; color: #94a3b8; white-space: nowrap; }
</style>
