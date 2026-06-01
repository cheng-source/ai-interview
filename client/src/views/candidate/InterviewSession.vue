<template>
  <!-- 第一步：面试信息确认页 -->
  <div v-if="!started" class="flex flex-col h-screen bg-gray-50">
    <div v-if="pageLoading" class="max-w-[480px] mx-auto mt-40 text-center text-gray-400 text-sm">加载中...</div>
    <div v-else class="max-w-[480px] mx-auto mt-20 p-10 text-center">
      <h1 class="text-[28px] text-gray-800 mb-2">AI 智能面试</h1>
      <p class="text-gray-500 text-sm mb-8">请确认以下信息，准备开始面试</p>

      <div class="bg-white border border-gray-200 rounded-xl p-6 text-left shadow-sm">
        <div class="mb-4">
          <span class="text-xs text-gray-400">候选人</span>
          <p class="text-base text-gray-800 font-medium">{{ candidateName || '--' }}</p>
        </div>
        <div class="mb-4">
          <span class="text-xs text-gray-400">应聘岗位</span>
          <p class="text-base text-gray-800 font-medium">{{ positionTitle || '--' }}</p>
        </div>
        <div class="mb-4">
          <span class="text-xs text-gray-400">部门</span>
          <p class="text-base text-gray-800 font-medium">{{ positionDepartment || '--' }}</p>
        </div>
        <div>
          <span class="text-xs text-gray-400">简历状态</span>
          <p :class="['text-sm font-medium', hasResume ? 'text-green-600' : 'text-orange-500']">
            {{ hasResume ? '已就绪' : '未上传简历，请使用下方文本框粘贴' }}
          </p>
        </div>
      </div>

      <div v-if="!hasResume" class="mt-4">
        <textarea
          v-model="manualResumeText"
          placeholder="请在此粘贴你的简历文本..."
          class="w-full p-3 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none resize-y text-sm leading-relaxed min-h-[120px] box-border focus:border-blue-400"
          rows="6"
        />
      </div>

      <el-button type="primary" size="large" class="mt-6" @click="handleStart" :disabled="!canStart || loading" :loading="loading">
        {{ loading ? '正在初始化面试...' : '开始面试' }}
      </el-button>

      <p v-if="!hasResume && !manualResumeText.trim()" class="text-gray-400 text-xs mt-2">请先粘贴简历内容再开始</p>
    </div>
  </div>

  <!-- 第二步：面试问答 -->
  <div v-else class="flex flex-col h-screen bg-gray-50">
    <div class="flex items-center justify-between pr-4 bg-white border-b border-gray-200">
      <ProgressIndicator :currentStage="store.currentStage" :interviewType="store.interviewType" />
      <span class="text-xs text-gray-500 whitespace-nowrap tabular-nums">已用时 {{ formatElapsed(store.totalElapsed) }}</span>
    </div>

    <div class="flex-1 overflow-y-auto p-5 flex flex-col" ref="chatRef">
      <ChatBubble v-for="msg in store.messages" :key="msg.id" :message="msg" />
      <div v-if="store.statusText" class="flex items-center gap-2 max-w-[80%] px-4 py-2.5 rounded-xl mb-3 self-start bg-gray-100 border border-gray-200 text-gray-500 text-[13px]">
        <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        {{ store.statusText }}
      </div>
      <div v-if="store.currentStage === 'done'" class="text-center py-5 text-green-500 text-base mt-6">
        ✓ 面试完成
      </div>
    </div>

    <div v-if="store.currentStage !== 'done'" class="flex gap-2 p-3 bg-white border-t border-gray-200">
      <div class="flex-1 flex flex-col">
        <textarea
          v-model="userInput"
          @keydown.enter.exact.prevent="handleSend"
          placeholder="描述你的思路... (Enter 发送)"
          class="flex-1 p-2.5 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none resize-none text-sm leading-relaxed min-h-11 focus:border-blue-400"
          :disabled="sending"
        />
        <div v-if="store.questionTimeRemaining > 0"
          :class="['text-xs mt-1 tabular-nums', store.questionTimeRemaining <= 30 ? 'text-red-500 font-semibold' : 'text-blue-500']">
          ⏱ 剩余 {{ formatElapsed(store.questionTimeRemaining) }}
        </div>
      </div>
      <el-button type="primary" @click="handleSend" :disabled="!userInput.trim() || sending" :loading="sending">
        {{ sending ? '发送中...' : '发送' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useInterviewStore } from '../../stores/interview';
import { interviewsApi } from '../../api/client';
import ChatBubble from '../../components/ChatBubble.vue';
import ProgressIndicator from '../../components/ProgressIndicator.vue';

const route = useRoute();
const store = useInterviewStore();
const interviewId = route.params.interviewId as string;
const userInput = ref('');
const manualResumeText = ref('');
const sending = ref(false);
const loading = ref(false);
const started = ref(false);
const chatRef = ref<HTMLElement | null>(null);

const pageLoading = ref(true);
const candidateName = ref('');
const positionTitle = ref('');
const positionDepartment = ref('');
const storedResumeText = ref('');

const hasResume = computed(() => !!storedResumeText.value);
const canStart = computed(() => hasResume.value || manualResumeText.value.trim().length > 0);

// 兼容两种消息格式：简单 { content } 和 LangChain 序列化 { kwargs: { content } }
function getMsgContent(m: any): string {
  return m?.kwargs?.content ?? m?.content ?? '';
}

async function handleStart() {
  if (!canStart.value || loading.value) return;
  loading.value = true; started.value = true; await nextTick();
  const resumeText = storedResumeText.value || manualResumeText.value.trim();
  try { await store.startInterview(interviewId, resumeText); } catch {}
  loading.value = false;
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || sending.value) return;
  sending.value = true; userInput.value = '';
  await store.sendAnswer(text);
  sending.value = false; await nextTick(); scrollToBottom();
}

function scrollToBottom() { if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight; }

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60); const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function handleTimeout() {
  if (sending.value || !store.interviewId) return;
  const text = userInput.value.trim();
  userInput.value = ''; sending.value = true;
  try { await store.sendAnswer(text || ''); } catch {}
  sending.value = false; await nextTick(); scrollToBottom();
}

onMounted(async () => { store.onTimeout(handleTimeout); await tryResume(); });

async function tryResume() {
  try {
    const res = await interviewsApi.getState(interviewId);
    const { state, status, startedAt, resumeText, candidate, position, interviewType } = res.data;

    // 保存候选人/岗位信息到本地
    if (candidate) {
      candidateName.value = candidate.name || '';
    }
    if (position) {
      positionTitle.value = position.title || '';
      positionDepartment.value = position.department || '';
    }
    storedResumeText.value = resumeText || '';
    if (interviewType) store.interviewType = interviewType;

    const hasMessages = state?.messages?.some((m: any) => getMsgContent(m));
    const isActive = hasMessages || (state?.currentStage && state.currentStage !== 'done');

    // 1. 有消息或有当前阶段 → 直接恢复聊天
    if (isActive) {
      if (hasMessages) {
        store.messages = state.messages.filter((m: any) => getMsgContent(m)).map((m: any) => {
          const content = getMsgContent(m);
          const idArr = Array.isArray(m.id) ? m.id : [];
          const isHuman = idArr.some((s: string) => s.includes('Human'));
          return { id: (typeof m.id === 'string' ? m.id : Date.now().toString()) + Math.random(), role: isHuman ? 'candidate' : 'interviewer', content: String(content), stage: state.currentStage || '', timestamp: Date.now(), streaming: false };
        });
        // 把评估消息插入到对应候选人回答之后
        if (state.answerHistory?.length) {
          for (const record of state.answerHistory) {
            if (!record.evaluation) continue;
            const ev = record.evaluation;
            const answerText = record.answer || '';
            // 从后往前找匹配的候选人消息，评估紧跟其后
            let insertIdx = -1;
            for (let i = store.messages.length - 1; i >= 0; i--) {
              if (store.messages[i].role === 'candidate' && (!answerText || store.messages[i].content === answerText)) {
                insertIdx = i + 1;
                break;
              }
            }
            const evalMsg = { id: Date.now().toString() + Math.random(), role: 'system' as const, content: `评分: ${ev.score}/10 — ${ev.summary || ''}`, stage: record.stage || '', timestamp: Date.now(), streaming: false };
            if (insertIdx >= 0 && insertIdx < store.messages.length) {
              store.messages.splice(insertIdx, 0, evalMsg);
            } else {
              store.messages.push(evalMsg);
            }
          }
        }
      }
      store.interviewId = interviewId; store.currentStage = state.currentStage || '';
      if (startedAt) store.totalElapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      store.startTotalTimer(); started.value = true; pageLoading.value = false;
      await nextTick(); scrollToBottom();
      // 恢复倒计时：从已恢复的消息中找最后一条含 [time] N 的
      for (let i = store.messages.length - 1; i >= 0; i--) {
        const m = store.messages[i].content.match(/\[time\]\s*(\d+)/);
        if (m) { store.startQuestionTimer(parseInt(m[1])); break; }
      }
      return;
    }

    // 2. DB 标记进行中但 graph 状态丢失（进程重启等）→ 用已有简历重建
    if (status === 'in_progress' && resumeText) {
      started.value = true; loading.value = true;
      await nextTick();
      try { await store.startInterview(interviewId, resumeText); } catch {}
      loading.value = false;
    }
    // 3. 全新面试 → 停留确认页，等待用户点击"开始面试"
    pageLoading.value = false;
  } catch (e) {
    console.error('恢复面试失败:', e);
    pageLoading.value = false;
  }
}

onUnmounted(() => { store.cleanup(); });
</script>
