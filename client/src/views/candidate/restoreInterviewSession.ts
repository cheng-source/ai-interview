import { nextTick, type Ref } from "vue";
import { interviewApi } from "@/api";
import { useInterviewStore } from "@/stores/interview";
import { buildRestoredInterview } from "@/utils/restore";

interface UseInterviewRestoreOptions {
  interviewId: string;
  interviewToken: string;
  store: ReturnType<typeof useInterviewStore>;
  started: Ref<boolean>;
  pageLoading: Ref<boolean>;
  pageError: Ref<string>;
  candidateName: Ref<string>;
  positionTitle: Ref<string>;
  positionDepartment: Ref<string>;
  storedResumeText: Ref<string>;
  scrollMessagesToBottom: Ref<(() => void) | null>;
}

function resolveRestoreErrorMessage(error: unknown): string {
  const status = (error as any)?.response?.status;
  const message = (error as any)?.message || "";

  if (status === 401) {
    return "面试链接已失效或 token 错误，请联系 HR 获取有效链接";
  }

  if (status === 404 || message.includes("not found")) {
    return "面试不存在，请确认链接是否正确";
  }

  return "加载失败，请检查网络后刷新重试";
}

export function useInterviewRestore(options: UseInterviewRestoreOptions) {
  const {
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
  } = options;

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

        if (restored.questionSeconds > 0) {
          store.startQuestionTimer(restored.questionSeconds);
        }
        if (hasActiveStream) store.resumeStream(interviewId).catch(() => {});
        return;
      }

      if (status === "in_progress" && resumeText) {
        started.value = true;
        store.interviewId = interviewId;
        store.currentStage = "icebreaker";
        store.addSystemMessage(
          "面试已开始，但本地未恢复到完整上下文。请刷新页面或联系管理员检查会话状态。",
        );
      }

      pageLoading.value = false;
    } catch (error) {
      console.error("恢复面试失败:", error);
      pageLoading.value = false;
      pageError.value = resolveRestoreErrorMessage(error);
    }
  }

  return { tryResume };
}
