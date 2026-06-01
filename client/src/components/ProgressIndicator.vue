<template>
  <div class="flex items-center px-4 py-2 bg-white border-b border-gray-200">
    <div v-for="stage in stages" :key="stage.key"
      :class="[
        'flex items-center gap-1 flex-1 text-[10px]',
        currentStage === stage.key ? 'opacity-100' : completedStages.has(stage.key) ? 'opacity-70' : 'opacity-30'
      ]">
      <span :class="[
        'w-2 h-2 rounded-full',
        currentStage === stage.key ? 'bg-blue-500' : completedStages.has(stage.key) ? 'bg-green-500' : 'bg-gray-300'
      ]" />
      <span class="text-gray-500 whitespace-nowrap">{{ stage.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ currentStage: string }>();
const stageOrder = ['icebreaker', 'technical', 'behavioral', 'qa', 'done'];
const stages = [
  { key: 'icebreaker', label: '自我介绍' }, { key: 'technical', label: '技术面' },
  { key: 'behavioral', label: '行为面' }, { key: 'qa', label: '反问' }, { key: 'done', label: '完成' },
];
const completedStages = computed(() => {
  const idx = stageOrder.indexOf(props.currentStage);
  return new Set(idx >= 0 ? stageOrder.slice(0, idx) : []);
});
</script>
