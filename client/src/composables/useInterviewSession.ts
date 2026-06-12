import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { interviewApi } from "@/api";
import { useInterviewStore } from "@/stores/interview";
import { buildRestoredInterview } from "@/utils/restore";

export function useInterviewSession(interviewId: string) {
  const store = useInterviewStore();
  const interviewToken = new URLSearchParams(window.location.search).get("token") || "";
  const manualResumeText = ref("");
  const sending = ref(false);
  const loading = ref(false);
  const started = ref(false);
  const pageLoading = ref(true);
  const pageError = ref("");
  const candidateName = ref("");
  const positionTitle = ref("");
  const positionDepartment = ref("");
  const storedResumeText = ref("");
  const consumePendingAnswer = ref<(() => string) | null>(null);
  const scrollMessagesToBottom = ref<(() => void) | null>(null);

  const hasResume = computed(() => !!storedResumeText.value);
  const canStart = computed(
    () => hasResume.value || manualResumeText.value.trim().length > 0,
  );

  function registerChatPanel(
    panel: {
      consumeDraft: () => string;
      scrollToBottom: () => void;
    } | null,
  ) {
    consumePendingAnswer.value = panel?.consumeDraft || null;
    scrollMessagesToBottom.value = panel?.scrollToBottom || null;
  }

  async function handleStart() {
    if (!canStart.value || loading.value) return;
    loading.value = true;
    started.value = true;
    await nextTick();

    const resumeText = storedResumeText.value || manualResumeText.value.trim();
    const markReady = () => {
      loading.value = false;
    };
    try {
      await store.startInterview(interviewId, resumeText, markReady);
    } finally {
      markReady();
    }
  }

  async function sendAnswer(answer: string) {
    if (sending.value) return;
    sending.value = true;
    const markReady = async () => {
      if (!sending.value) return;
      sending.value = false;
      await nextTick();
      scrollMessagesToBottom.value?.();
    };
    try {
      await store.sendAnswer(answer, () => {
        markReady().catch(() => {});
      });
    } finally {
      await markReady();
    }
  }

  async function handleTimeout() {
    if (sending.value || !store.interviewId) return;
    await sendAnswer(consumePendingAnswer.value?.() || "");
  }

  async function tryResume() {
    try {
      if (interviewToken) store.setInterviewToken(interviewToken);
      const res = await interviewApi.getState(interviewId, interviewToken);
      const {
        state,
        status,
        startedAt,
        resumeText,
        candidate,
        position,
        interviewType,
        hasActiveStream,
      } = res.data;

      if (candidate) candidateName.value = candidate.name || "";
      if (position) {
        positionTitle.value = position.title || "";
        positionDepartment.value = position.department || "";
      }
      storedResumeText.value = resumeText || "";
      if (interviewType) store.interviewType = interviewType;

      const restored = buildRestoredInterview({
        state,
        interviewId,
        startedAt,
        hasActiveStream,
      });

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
        scrollMessagesToBottom.value?.();

        if (restored.questionSeconds > 0)
          store.startQuestionTimer(restored.questionSeconds);
        if (hasActiveStream) store.resumeStream(interviewId).catch(() => {});
        return;
      }

      if (status === "in_progress" && resumeText) {
        started.value = true;
        store.interviewId = interviewId;
        store.currentStage = "icebreaker";
        store.addSystemMessage("面试已开始，但本地未恢复到完整上下文。请刷新页面或联系管理员检查会话状态。");
      }

      pageLoading.value = false;
    } catch (error) {
      console.error("恢复面试失败:", error);
      pageLoading.value = false;
      // 区分 token 错误和网络错误
      const status = (error as any)?.response?.status;
      if (status === 401) {
        pageError.value = "面试链接已失效或 token 错误，请联系 HR 获取有效链接";
      } else if (status === 404 || (error as any)?.message?.includes("not found")) {
        pageError.value = "面试不存在，请确认链接是否正确";
      } else {
        pageError.value = "加载失败，请检查网络后刷新重试";
      }
    }
  }

  onMounted(async () => {
    store.onTimeout(handleTimeout);
    await tryResume();
  });

  onUnmounted(() => {
    store.cleanup();
  });

  return {
    store,
    manualResumeText,
    sending,
    loading,
    started,
    pageLoading,
    pageError,
    candidateName,
    positionTitle,
    positionDepartment,
    hasResume,
    canStart,
    handleStart,
    registerChatPanel,
    sendAnswer,
  };
}
