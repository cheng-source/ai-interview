<template>
  <div class="relative flex shrink-0 h-full" :style="{ width: sidebarWidth + 'px' }">
    <!-- 拖拽手柄 -->
    <div
      class="absolute left-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400/30 transition-colors z-10"
      @mousedown.prevent="startResize"
    />
    <div class="flex flex-col w-full bg-gray-50 border-l border-gray-200 text-sm h-full">
    <!-- Tab 头部 -->
    <div class="flex bg-white border-b border-gray-200 shrink-0">
      <button
        v-for="tab in tabs" :key="tab.key"
        @click="activeTab = tab.key"
        :class="[
          'flex-1 text-center py-2.5 text-xs font-medium transition-colors border-b-2',
          activeTab === tab.key ? 'text-blue-600 border-blue-500' : 'text-gray-400 border-transparent hover:text-gray-500'
        ]"
      >{{ tab.label }}</button>
    </div>

    <!-- Tab 1: AI 状态 -->
    <div v-if="activeTab === 'status'" class="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
      <!-- 连接状态 -->
      <div :class="[
        'flex items-center gap-2 px-2.5 py-2 rounded-md text-xs',
        store.isConnected ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
      ]">
        <span :class="['w-1.5 h-1.5 rounded-full', store.isConnected ? 'bg-green-500' : 'bg-red-500']" />
        {{ store.isConnected ? 'SSE 连接正常' : '连接已断开' }}
      </div>

      <!-- 当前阶段 -->
      <div class="bg-white rounded-lg border border-gray-200 p-3">
        <div class="text-[10px] text-gray-400 uppercase tracking-wider mb-1">当前阶段</div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span class="font-semibold text-gray-800">{{ stageLabel(store.currentStage) }}</span>
        </div>
        <div v-if="store.statusText" class="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          {{ store.statusText }}
        </div>
      </div>

      <!-- 执行流程时间线 -->
      <div class="bg-white rounded-lg border border-gray-200 p-3 flex-1 overflow-y-auto">
        <div class="text-[10px] text-gray-400 uppercase tracking-wider mb-2">执行流程</div>
        <div v-if="store.stageLog.length === 0" class="text-xs text-gray-400 text-center py-4">等待开始...</div>
        <div v-else class="flex flex-col">
          <div v-for="(item, i) in store.stageLog" :key="i" class="flex gap-2">
            <div class="flex flex-col items-center w-4 shrink-0">
              <span v-if="item.type === 'completed'" class="text-green-500 text-[10px]">✓</span>
              <span v-else class="text-blue-500 text-[10px]">●</span>
              <div v-if="i < store.stageLog.length - 1" class="w-px flex-1 bg-gray-200 min-h-[12px]" />
            </div>
            <div :class="['pb-2.5', item.type === 'active' ? 'text-blue-700 font-medium' : 'text-gray-600']">
              <div class="text-[11px]">{{ item.label }}</div>
              <div v-if="item.time" class="text-[9px] text-gray-400">{{ item.time }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 面试进度 -->
      <div class="bg-white rounded-lg border border-gray-200 p-3">
        <div class="text-[10px] text-gray-400 uppercase tracking-wider mb-2">面试进度</div>
        <div class="flex gap-0.5">
          <div
            v-for="s in progressStages" :key="s.key"
            :class="['h-1 rounded-sm', progressClass(s.key)]"
            :style="{ flex: s.key === 'technical' || s.key === 'behavioral' ? 2 : 1 }"
            :title="s.label"
          />
        </div>
        <div class="flex justify-between text-[9px] text-gray-400 mt-1.5">
          <span v-for="s in progressStages" :key="s.key">{{ s.label }}</span>
        </div>
      </div>
    </div>

    <!-- Tab 2: 成绩单 -->
    <div v-if="activeTab === 'scorecard'" class="flex-1 overflow-y-auto flex flex-col gap-2.5 p-2.5">
      <!-- 均分大盘 -->
      <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 text-center border border-blue-100">
        <div class="text-[10px] text-gray-500 uppercase tracking-wider">当前均分</div>
        <div class="text-3xl font-bold text-blue-700 my-1">{{ avgScore }}</div>
        <div class="h-1.5 bg-blue-100 rounded-full"><div :class="['h-full rounded-full transition-all', avgScoreColor]" :style="{ width: (avgScoreNum * 10) + '%' }" /></div>
        <div class="text-[10px] text-gray-500 mt-2">{{ store.evaluations.length }} 题已完成</div>
      </div>

      <!-- 评分卡片列表 -->
      <div v-if="store.evaluations.length === 0" class="text-xs text-gray-400 text-center py-8">暂无评分记录</div>
      <div v-for="(ev, i) in store.evaluations" :key="i" class="bg-white rounded-lg border border-gray-200 p-3">
        <div class="flex justify-between items-start mb-1.5">
          <span class="text-xs font-semibold text-gray-700 leading-snug flex-1 mr-2">{{ ev.questionText || `Q${i + 1}` }}</span>
          <span :class="['text-lg font-bold shrink-0', scoreColor(ev.score)]">{{ ev.score }}</span>
        </div>
        <div v-if="ev.summary" class="text-[11px] text-gray-500 leading-relaxed">{{ ev.summary }}</div>
        <div class="text-[9px] text-gray-400 mt-1.5">{{ stageLabel(ev.stage) }}</div>
      </div>

      <!-- 等待占位 -->
      <div v-if="store.currentStage !== 'done' && store.currentStage !== ''" class="bg-white rounded-lg border border-dashed border-blue-300 p-3 flex items-center justify-center gap-2 text-xs text-gray-400">
        <span class="text-base">⏳</span>
        等待下一题回答...
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useInterviewStore } from '@/stores/interview';

const store = useInterviewStore();
const activeTab = ref<'status' | 'scorecard'>('status');

// 侧边栏拖拽拉伸
const sidebarWidth = ref(260);
const MIN_WIDTH = 200;
const MAX_WIDTH = 500;

function startResize(e: MouseEvent) {
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;
  const onMove = (ev: MouseEvent) => {
    sidebarWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const tabs = [
  { key: 'status' as const, label: '🤖 AI 状态' },
  { key: 'scorecard' as const, label: '📊 成绩单' },
];

const stageMap: Record<string, string> = {
  icebreaker: '自我介绍',
  technical: '技术面',
  behavioral: '行为面',
  qa: '反问',
  done: '完成',
};

function stageLabel(stage: string): string {
  return stageMap[stage] || stage || '等待中';
}

const allProgressStages = [
  { key: 'icebreaker', label: '破冰' },
  { key: 'technical', label: '技术面' },
  { key: 'behavioral', label: '行为面' },
  { key: 'qa', label: '反问' },
];

const progressStages = computed(() => {
  if (store.interviewType === 'behavioral') return allProgressStages.filter(s => s.key !== 'technical');
  if (store.interviewType === 'technical') return allProgressStages.filter(s => s.key !== 'behavioral');
  return allProgressStages;
});

const stageOrder = computed(() => progressStages.value.map(s => s.key));

function progressClass(key: string): string {
  const curIdx = stageOrder.value.indexOf(store.currentStage);
  const keyIdx = stageOrder.value.indexOf(key);
  if (store.currentStage === 'done' || keyIdx < curIdx) return 'bg-green-400';
  if (keyIdx === curIdx) return 'bg-blue-500';
  return 'bg-gray-200';
}

const avgScoreNum = computed(() => {
  if (store.evaluations.length === 0) return 0;
  const sum = store.evaluations.reduce((a, b) => a + b.score, 0);
  return Math.round(sum / store.evaluations.length * 10) / 10;
});

const avgScore = computed(() => {
  if (store.evaluations.length === 0) return '--';
  return avgScoreNum.value.toFixed(1);
});

const avgScoreColor = computed(() => {
  const s = avgScoreNum.value;
  if (s >= 7) return 'bg-green-500';
  if (s >= 5) return 'bg-yellow-500';
  return 'bg-red-500';
});

function scoreColor(score: number): string {
  if (score >= 7) return 'text-green-600';
  if (score >= 5) return 'text-yellow-600';
  return 'text-red-600';
}
</script>
