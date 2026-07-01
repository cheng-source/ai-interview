import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useInterviewStore } from "@/stores/interview";
import { useInterviewRestore } from "./restoreInterviewSession";

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

  const { tryResume } = useInterviewRestore({
    interviewId,
    interviewToken,
    store,
    started,
    pageLoading,
    pageError,
    candidateName,
    positionTitle,
    positionDepartment,
    storedResumeText,
    scrollMessagesToBottom,
  });

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
