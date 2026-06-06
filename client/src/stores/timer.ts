import { ref } from "vue";

/** 面试计时器 composable，从 store 中独立出来 */
export function useInterviewTimer() {
  const questionTimeRemaining = ref(0);
  const totalElapsed = ref(0);
  let questionTimer: ReturnType<typeof setInterval> | null = null;
  let totalTimer: ReturnType<typeof setInterval> | null = null;
  let onTimeoutCallback: (() => void) | null = null;

  function onTimeout(cb: () => void) {
    onTimeoutCallback = cb;
  }

  function tryStartTimer(text: string) {
    const match = text.match(/\[time\]\s*(\d+)/);
    if (match) startQuestionTimer(parseInt(match[1]));
  }

  function startQuestionTimer(seconds: number) {
    stopQuestionTimer();
    if (!seconds || seconds <= 0) return;
    questionTimeRemaining.value = seconds;
    questionTimer = setInterval(() => {
      questionTimeRemaining.value--;
      if (questionTimeRemaining.value <= 0) {
        stopQuestionTimer();
        onTimeoutCallback?.();
      }
    }, 1000);
  }

  function stopQuestionTimer() {
    if (questionTimer) { clearInterval(questionTimer); questionTimer = null; }
    questionTimeRemaining.value = 0;
  }

  function startTotalTimer(initialSeconds = 0) {
    stopTotalTimer();
    totalElapsed.value = Math.max(0, initialSeconds);
    totalTimer = setInterval(() => { totalElapsed.value++; }, 1000);
  }

  function stopTotalTimer() {
    if (totalTimer) { clearInterval(totalTimer); totalTimer = null; }
  }

  function stopAllTimers() {
    stopQuestionTimer();
    stopTotalTimer();
  }

  return {
    questionTimeRemaining,
    totalElapsed,
    onTimeout,
    tryStartTimer,
    startQuestionTimer,
    stopQuestionTimer,
    startTotalTimer,
    stopTotalTimer,
    stopAllTimers,
  };
}
