<template>
  <!-- 第一步：面试信息确认页 -->
  <div v-if="!started" class="flex flex-col h-screen bg-gray-50">
    <div
      v-if="pageLoading"
      class="max-w-[480px] mx-auto mt-40 text-center text-gray-400 text-sm"
    >
      加载中...
    </div>
    <div v-else class="max-w-[480px] mx-auto mt-20 p-10 text-center">
      <h1 class="text-[28px] text-gray-800 mb-2">AI 智能面试</h1>
      <p class="text-gray-500 text-sm mb-8">请确认以下信息，准备开始面试</p>

      <div
        class="bg-white border border-gray-200 rounded-xl p-6 text-left shadow-sm"
      >
        <div class="mb-4">
          <span class="text-xs text-gray-400">候选人</span>
          <p class="text-base text-gray-800 font-medium">
            {{ candidateName || "--" }}
          </p>
        </div>
        <div class="mb-4">
          <span class="text-xs text-gray-400">应聘岗位</span>
          <p class="text-base text-gray-800 font-medium">
            {{ positionTitle || "--" }}
          </p>
        </div>
        <div class="mb-4">
          <span class="text-xs text-gray-400">部门</span>
          <p class="text-base text-gray-800 font-medium">
            {{ positionDepartment || "--" }}
          </p>
        </div>
        <div>
          <span class="text-xs text-gray-400">简历状态</span>
          <p
            :class="[
              'text-sm font-medium',
              hasResume ? 'text-green-600' : 'text-orange-500',
            ]"
          >
            {{ hasResume ? "已就绪" : "未上传简历，请使用下方文本框粘贴" }}
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

      <el-button
        type="primary"
        size="large"
        class="mt-6"
        @click="handleStart"
        :disabled="!canStart || loading"
        :loading="loading"
      >
        {{ loading ? "正在初始化面试..." : "开始面试" }}
      </el-button>

      <p
        v-if="!hasResume && !manualResumeText.trim()"
        class="text-gray-400 text-xs mt-2"
      >
        请先粘贴简历内容再开始
      </p>
    </div>
  </div>

  <!-- 第二步：面试问答 -->
  <div v-else class="flex flex-col h-screen bg-gray-50">
    <div
      class="flex items-center justify-between pr-4 bg-white border-b border-gray-200"
    >
      <ProgressIndicator
        :currentStage="store.currentStage"
        :interviewType="store.interviewType"
      />
      <span class="text-xs text-gray-500 whitespace-nowrap tabular-nums"
        >已用时 {{ formatElapsed(store.totalElapsed) }}</span
      >
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- 左侧：聊天 + 输入区 -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto p-5 flex flex-col" ref="chatRef">
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
            AI正在思考中...
          </div>
          <div
            v-if="store.currentStage === 'done'"
            class="text-center py-5 text-green-500 text-base mt-6"
          >
            ✓ 面试完成
          </div>
        </div>

        <div
          v-if="store.currentStage !== 'done'"
          class="flex gap-2 p-3 bg-white border-t border-gray-200"
        >
          <div class="flex-1 flex flex-col">
            <textarea
              ref="inputRef"
              v-model="userInput"
              @keydown.enter.exact.prevent="handleSend"
              @input="autoResize"
              placeholder="描述你的思路... (Enter 发送，Shift+Enter 换行)"
              class="flex-1 p-2.5 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none resize-none text-sm leading-relaxed min-h-11 max-h-[30vh] focus:border-blue-400 overflow-y-auto"
              :disabled="sending"
            />
            <div
              v-if="store.questionTimeRemaining > 0"
              :class="[
                'text-xs mt-1 tabular-nums',
                store.questionTimeRemaining <= 30
                  ? 'text-red-500 font-semibold'
                  : 'text-blue-500',
              ]"
            >
              ⏱ 剩余 {{ formatElapsed(store.questionTimeRemaining) }}
            </div>
          </div>
          <el-button
            type="primary"
            @click="handleSend"
            :disabled="!userInput.trim() || sending"
            :loading="sending"
          >
            {{ sending ? "发送中..." : "发送" }}
          </el-button>
        </div>
      </div>

      <!-- 右侧：AI 状态侧边栏 -->
      <InterviewSidebar v-if="store.currentStage !== 'done'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useInterviewStore } from "../../stores/interview";
import { interviewsApi } from "../../api/client";
import ChatBubble from "../../components/ChatBubble.vue";
import ProgressIndicator from "../../components/ProgressIndicator.vue";
import InterviewSidebar from "../../components/InterviewSidebar.vue";
import { buildRestoredInterview } from "./restore";

const stageLabelMap: Record<string, string> = {
  icebreaker: '自我介绍', technical: '技术面', behavioral: '行为面', qa: '反问', done: '完成',
};
function stageLabel(s: string): string { return stageLabelMap[s] || s; }

const route = useRoute();
const store = useInterviewStore();
const interviewId = route.params.interviewId as string;
const userInput = ref("");
const inputRef = ref<HTMLTextAreaElement | null>(null);
function autoResize() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
const manualResumeText = ref("");
const sending = ref(false);
const loading = ref(false);
const started = ref(false);
const chatRef = ref<HTMLElement | null>(null);

const pageLoading = ref(true);
const candidateName = ref("");
const positionTitle = ref("");
const positionDepartment = ref("");
const storedResumeText = ref("");

const hasResume = computed(() => !!storedResumeText.value);
const canStart = computed(
  () => hasResume.value || manualResumeText.value.trim().length > 0,
);

function mkMsgId(): string {
  return Date.now().toString() + Math.random();
}

async function handleStart() {
  if (!canStart.value || loading.value) return;
  loading.value = true;
  started.value = true;
  await nextTick();
  const resumeText = storedResumeText.value || manualResumeText.value.trim();
  try {
    await store.startInterview(interviewId, resumeText);
  } catch {}
  loading.value = false;
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  userInput.value = "";
  autoResize();
  await store.sendAnswer(text);
  sending.value = false;
  await nextTick();
  scrollToBottom();
}

function scrollToBottom() {
  if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function handleTimeout() {
  if (sending.value || !store.interviewId) return;
  const text = userInput.value.trim();
  userInput.value = "";
  autoResize();
  sending.value = true;
  try {
    await store.sendAnswer(text || "");
  } catch {}
  sending.value = false;
  await nextTick();
  scrollToBottom();
}

// 自动滚屏：监听最后一条消息的内容长度变化（覆盖新增消息 + 流式追加两种场景）
watch(
  () => {
    const msgs = store.messages;
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];
    return `${msgs.length}:${last.id}:${last.content.length}`;
  },
  () => {
    nextTick(() => scrollToBottom());
  },
);

onMounted(async () => {
  store.onTimeout(handleTimeout);
  await tryResume();
});

/** 从 answerHistory 重建全部聊天消息（Q&A + 评估） */
function restoreFromAnswerHistory(state: any) {
  for (const record of state.answerHistory) {
    const isCandidateQA = record.stage === "candidate_qa";

    if (record.question?.text) {
      store.messages.push({
        id: mkMsgId(),
        role: isCandidateQA ? "candidate" : "interviewer",
        content: record.question.text,
        stage: record.stage || "", timestamp: Date.now(), streaming: false,
      });
    }
    if (record.answer) {
      store.messages.push({
        id: mkMsgId(),
        role: isCandidateQA ? "interviewer" : "candidate",
        content: record.answer,
        stage: record.stage || "", timestamp: Date.now(), streaming: false,
      });
    }
    if (record.evaluation) {
      store.evaluations.push({
        questionText: record.question?.text || "",
        score: record.evaluation.score,
        summary: record.evaluation.summary || "",
        stage: record.stage || "",
      });
    }
  }
}

/** 恢复报告（state.reportText 由 generate_report 节点写入） */
function restoreReport(state: any) {
  if (state.finalReport) {
    store.report = state.finalReport;
  }

  if (state.currentStage === "done" && state.reportText) {
    store.messages.push({
      id: mkMsgId(), role: "interviewer",
      content: state.reportText, stage: "done", timestamp: Date.now(), streaming: false,
    });
  }
}

/** 重建侧边栏执行流程时间线 */
function buildStageLog(state: any) {
  const log: Array<{ label: string; time: string; type: "completed" | "active" }> = [];

  log.push({ label: "破冰", time: "", type: "completed" });

  if (state.candidate?.skills?.length > 0 || state.candidate?.projects?.length > 0) {
    log.push({ label: "简历解析", time: "", type: "completed" });
  }

  if (state.answerHistory?.length) {
    for (let i = 0; i < state.answerHistory.length; i++) {
      const r = state.answerHistory[i];
      const shortText = r.question?.text
        ? r.question.text.length > 18 ? r.question.text.slice(0, 18) + "..." : r.question.text
        : "";
      log.push({ label: `Q${i + 1}${shortText ? ": " + shortText : ""}`, time: "", type: "completed" });
      if (r.evaluation)
        log.push({ label: `Q${i + 1} 评估 (${r.evaluation.score}/10)`, time: "", type: "completed" });
    }
  }

  if (state.currentStage && state.currentStage !== "done") {
    log.push({ label: `${stageLabelMap[state.currentStage] || state.currentStage} · 进行中`, time: "", type: "active" });
  } else if (state.currentStage === "done") {
    log.push({ label: "面试完成", time: "", type: "completed" });
  }

  return log;
}

async function tryResume() {
  try {
    const res = await interviewsApi.getState(interviewId);
    const { state, status, startedAt, resumeText, candidate, position, interviewType, hasActiveStream } = res.data;
    console.log('[tryResume] state:', state ? `answerHistory=${state.answerHistory?.length}, stage=${state.currentStage}` : 'null', 'status:', status, 'resumeText:', !!resumeText);

    if (candidate) candidateName.value = candidate.name || "";
    if (position) {
      positionTitle.value = position.title || "";
      positionDepartment.value = position.department || "";
    }
    storedResumeText.value = resumeText || "";
    if (interviewType) store.interviewType = interviewType;
    debugger
    const restored = buildRestoredInterview({ state, interviewId, startedAt, hasActiveStream });

    // 1. 有可恢复图状态 → 恢复聊天（包含当前待回答问题）
    if (restored.started) {
      store.messages = restored.messages;
      store.evaluations = restored.evaluations;
      store.stageLog = restored.stageLog;
      store.report = restored.report;
      store.interviewId = restored.interviewId;
      store.currentStage = restored.currentStage;
      store.totalElapsed = restored.totalElapsed;
      store.startTotalTimer(restored.totalElapsed);
      started.value = true;
      pageLoading.value = false;
      await nextTick();
      scrollToBottom();

      if (restored.questionSeconds > 0) store.startQuestionTimer(restored.questionSeconds);
      if (hasActiveStream) {
        store.resumeStream(interviewId).catch(() => {});
      }
      return;
    }

    // 2. DB 标记进行中但 graph 状态丢失 → 重新开始
    if (status === "in_progress" && resumeText) {
      started.value = true;
      loading.value = true;
      await nextTick();
      try { await store.startInterview(interviewId, resumeText); } catch {}
      loading.value = false;
    }
    // 3. 全新面试 → 停留确认页
    pageLoading.value = false;
  } catch (e) {
    console.error("恢复面试失败:", e);
    pageLoading.value = false;
  }
}

onUnmounted(() => {
  store.cleanup();
});
</script>
