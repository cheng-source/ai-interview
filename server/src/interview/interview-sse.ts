import {
  InterviewStreamContext,
  createStreamingContext,
  clearStreamingContext,
  getOrStartResumeParse,
  runWithStreamingContext,
} from "../langgraph/llm";
import { doParseResume } from "../langgraph/nodes/analyze-resume.node";
import type { PrismaService } from "../prisma/prisma.service";
import { Observable } from "rxjs";

const activeInterviewStreams = new Map<string, InterviewStreamContext>();
const inFlightClientMessages = new Set<string>();
const activeAnswerLocks = new Set<string>();

/** 依赖注入——SSE 流式方法需要的共享资源 */
export interface SseDeps {
  graph: any;
  prisma: PrismaService;
}

export function registerActiveInterviewStream(
  interviewId: string,
  stream: InterviewStreamContext,
) {
  activeInterviewStreams.set(interviewId, stream);
}

export function getActiveInterviewStream(
  interviewId: string,
): InterviewStreamContext | null {
  return activeInterviewStreams.get(interviewId) || null;
}

export function clearActiveInterviewStream(
  interviewId: string,
  stream: InterviewStreamContext,
) {
  if (activeInterviewStreams.get(interviewId) === stream) {
    activeInterviewStreams.delete(interviewId);
  }
}

export function hasRestorableStateValues(values: any): boolean {
  return (
    !!values &&
    Object.keys(values).length > 0 &&
    (Array.isArray(values.answerHistory) ||
      !!values.currentStage ||
      !!values.techRound?.currentQuestion ||
      !!values.behavioralRound?.currentQuestion ||
      !!values.reportText)
  );
}

export function asyncIterableToObservable<T>(
  iterable: AsyncIterable<T>,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    const iterator = iterable[Symbol.asyncIterator]();
    let cancelled = false;

    (async () => {
      try {
        while (!cancelled) {
          const { value, done } = await iterator.next();
          if (done) break;
          subscriber.next(value);
        }
        if (!cancelled) subscriber.complete();
      } catch (error) {
        if (!cancelled) subscriber.error(error);
      }
    })();

    return () => {
      cancelled = true;
      iterator.return?.();
    };
  });
}

export function normalizeStateValues(values: any, next?: unknown): any {
  if (!values) return values;

  const normalized = { ...values };
  const nextNodes = Array.isArray(next) ? next.map(String) : [];

  if (normalized.currentStage === "done") return normalized;

  if (
    nextNodes.includes("answer_candidate_questions") ||
    nextNodes.includes("candidate_qa")
  ) {
    normalized.currentStage = "candidate_qa";
    return normalized;
  }

  if (
    nextNodes.includes("evaluate_behavioral_answer") ||
    nextNodes.includes("behavioral_evaluate") ||
    normalized.currentStage === "behavioral"
  ) {
    if (normalized.behavioralRound?.currentQuestion?.text)
      normalized.currentStage = "behavioral";
    return normalized;
  }

  if (
    nextNodes.includes("evaluate_technical_answer") ||
    nextNodes.includes("tech_evaluate") ||
    normalized.currentStage === "technical"
  ) {
    if (normalized.techRound?.currentQuestion?.text)
      normalized.currentStage = "technical";
    return normalized;
  }

  if (normalized.behavioralRound?.currentQuestion?.text) {
    normalized.currentStage = "behavioral";
    return normalized;
  }

  if (normalized.techRound?.currentQuestion?.text) {
    normalized.currentStage = "technical";
  }

  return normalized;
}

export function isTerminalInterviewState(values: any): boolean {
  return (
    values?.currentStage === "done" ||
    !!values?.reportText ||
    !!values?.finalReport
  );
}

function parseStateJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function shouldRestoreCheckpointFromDb(values: any, dbState: any): boolean {
  if (!dbState) return false;
  if (!hasRestorableStateValues(values)) return true;
  if (!values?.resumeText && dbState?.resumeText) return true;
  if (!values?.position?.title && dbState?.position?.title) return true;
  if (
    !values?.techRound?.currentQuestion?.text &&
    dbState?.techRound?.currentQuestion?.text
  ) {
    return true;
  }
  if (
    !Array.isArray(values?.answerHistory) ||
    values.answerHistory.length < (dbState?.answerHistory?.length || 0)
  ) {
    return true;
  }
  return false;
}

async function getStateWithDbFallback(
  deps: SseDeps,
  config: any,
  interview: any,
) {
  let state = await deps.graph.getState(config);
  let stateConfig = (state as any)?.config || config;
  const dbState = parseStateJson(interview.stateJson);

  if (shouldRestoreCheckpointFromDb(state?.values, dbState)) {
    console.warn("[streamAnswer] restoring checkpoint from DB stateJson", {
      threadId: interview.threadId,
      checkpointStage: state?.values?.currentStage,
      checkpointHistory: state?.values?.answerHistory?.length,
      dbStage: dbState?.currentStage,
      dbHistory: dbState?.answerHistory?.length,
    });
    const restoredConfig = await deps.graph.updateState(stateConfig, dbState);
    state = await deps.graph.getState(restoredConfig);
    stateConfig = (state as any)?.config || restoredConfig;
    return { state, config: stateConfig };
  }

  return { state, config: stateConfig };
}

/** 后台异步解析简历（共享 Promise，仅预热 LLM 调用，结果由 analyzeResumeNode 写入 graph state） */
async function parseResumeAsync(
  deps: SseDeps,
  threadId: string,
  resumeText: string,
  jdText: string,
) {
  getOrStartResumeParse(threadId, () =>
    doParseResume(resumeText, jdText, undefined, { silent: true }),
  ).catch(() => {});
}

/** 面试启动：invoke 驱动图执行，节点内部通过 pushEvent 自行推送 SSE 事件 */
export async function* streamStart(
  deps: SseDeps,
  interviewId: string,
  resumeText?: string,
) {
  const interview = await deps.prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, position: true },
  });
  if (!interview) throw new Error("Interview not found");
  if (interview.status !== "pending") {
    throw new Error(
      "Interview has already started. Use the resume stream instead.",
    );
  }

  const finalResumeText = resumeText || interview.candidate.resumeText || "";
  if (!finalResumeText) throw new Error("未找到简历内容");

  if (resumeText && !interview.candidate.resumeText) {
    deps.prisma.candidate
      .update({
        where: { id: interview.candidateId },
        data: { resumeText },
      })
      .catch(() => {});
  }

  const initialState = {
    threadId: interview.threadId,
    candidate: {
      name: interview.candidate.name,
      skills: [],
      experience: 0,
      projects: [],
      strengths: [],
      gaps: [],
    },
    position: {
      title: interview.position.title,
      department: interview.position.department,
      jdText: interview.position.jdText,
      techStack: interview.position.techStack,
      level: interview.position.level,
    },
    resumeText: finalResumeText,
    interviewType: interview.interviewType || "technical",
    answerHistory: [
      {
        stage: "icebreaker",
        question: {
          text: `${interview.candidate.name || "你好"}，我是今天的AI面试官。请先做一个简单的自我介绍吧。`,
          type: "behavioral",
          topic: "自我介绍",
          difficulty: 1,
        },
      },
    ],
  };

  const config = { configurable: { thread_id: interview.threadId } };
  console.log(
    "[streamStart] initializing with answerHistory:",
    initialState.answerHistory?.length,
  );
  const queue = createStreamingContext();
  registerActiveInterviewStream(interviewId, queue);
  queue.push({
    type: "message",
    content: initialState.answerHistory[0].question.text,
    stage: "icebreaker",
  });
  queue.push({ type: "stage", stage: "icebreaker" });

  parseResumeAsync(
    deps,
    interview.threadId,
    finalResumeText,
    interview.position.jdText,
  );

  const graphTask = runWithStreamingContext(queue, async () => {
    try {
      await deps.graph.invoke(initialState, config);
    } catch (e: any) {
      const isInterrupt =
        e?.name === "GraphInterrupt" ||
        e?.constructor?.name === "GraphInterrupt";
      if (!isInterrupt) queue.push({ type: "error", message: String(e) });
    } finally {
      await deps.prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "in_progress",
          startedAt: new Date(),
          lastActiveAt: new Date(),
        },
      });
      try {
        const st = await deps.graph.getState(config);
        console.log(
          "[streamStart] checkpoint state:",
          st?.values
            ? `answerHistory=${(st.values as any).answerHistory?.length}, stage=${(st.values as any).currentStage}`
            : "null",
        );
        if (st?.values) {
          await deps.prisma.interview
            .update({
              where: { id: interviewId },
              data: { stateJson: st.values as any },
            })
            .catch(() => {});
        }
      } catch {}
      clearStreamingContext();
      clearActiveInterviewStream(interviewId, queue);
      queue.done();
    }
  });

  for await (const item of queue) yield item;
}

/** 候选人回答处理：updateState 注入回答 → invoke 恢复图执行 */
export async function* streamAnswer(
  deps: SseDeps,
  interviewId: string,
  userMessage: string,
  clientMessageId?: string,
) {
  const interview = await deps.prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, position: true },
  });
  if (!interview) throw new Error("Interview not found");

  deps.prisma.interview
    .update({ where: { id: interviewId }, data: { lastActiveAt: new Date() } })
    .catch(() => {});

  let config = { configurable: { thread_id: interview.threadId } };
  const dedupeKey = clientMessageId ? `${interviewId}:${clientMessageId}` : "";

  if (clientMessageId) {
    const result = await getStateWithDbFallback(deps, config, interview);
    const state = result.state;
    config = result.config;
    const processed = Array.isArray(state?.values?.processedClientMessageIds)
      ? state.values.processedClientMessageIds
      : [];
    if (processed.includes(clientMessageId) || inFlightClientMessages.has(dedupeKey)) {
      yield {
        type: "llm_warning",
        code: "DUPLICATE_MESSAGE",
        message: "检测到重复提交，本次请求已忽略。",
      };
      const values = hasRestorableStateValues(state?.values)
        ? normalizeStateValues(state.values, (state as any).next)
        : null;
      if (values?.currentStage) yield { type: "stage", stage: values.currentStage };
      return;
    }
    inFlightClientMessages.add(dedupeKey);
  }

  if (activeAnswerLocks.has(interviewId)) {
    const result = await getStateWithDbFallback(deps, config, interview);
    const state = result.state;
    config = result.config;
    yield {
      type: "llm_warning",
      code: "ANSWER_IN_PROGRESS",
      message: "上一条回答仍在处理中，请稍候。",
    };
    const values = hasRestorableStateValues(state?.values)
      ? normalizeStateValues(state.values, (state as any).next)
      : null;
    if (values?.currentStage) yield { type: "stage", stage: values.currentStage };
    if (dedupeKey) inFlightClientMessages.delete(dedupeKey);
    return;
  }
  activeAnswerLocks.add(interviewId);

  const queue = createStreamingContext();
  registerActiveInterviewStream(interviewId, queue);

  const graphTask = runWithStreamingContext(queue, async () => {
    try {
      const result = await getStateWithDbFallback(deps, config, interview);
      const state = result.state;
      config = result.config;
      console.log("[streamAnswer] state.next:", (state as any)?.next);
      console.log("[streamAnswer] currentStage:", state?.values?.currentStage);
      console.log("[streamAnswer] tasks:", (state as any)?.tasks);
      const processedClientMessageIds = clientMessageId
        ? [
            ...new Set([
              ...((state?.values?.processedClientMessageIds as string[] | undefined) || []),
              clientMessageId,
            ]),
          ]
        : undefined;
      const stateUpdate = clientMessageId
        ? { candidateAnswer: userMessage, processedClientMessageIds }
        : { candidateAnswer: userMessage };
      try {
        config = await deps.graph.updateState(config, stateUpdate);
      } catch (e: any) {
        const nextNodes = Array.isArray((state as any)?.next)
          ? ((state as any).next as string[])
          : [];
        const taskNodes = Array.isArray((state as any)?.tasks)
          ? ((state as any).tasks as any[]).map((task) => String(task?.name || ""))
          : [];
        const isWaitingForCandidateQuestion =
          nextNodes.includes("answer_candidate_questions") ||
          taskNodes.includes("answer_candidate_questions");

        if (
          String(e?.message || e).includes("Ambiguous update") &&
          isWaitingForCandidateQuestion
        ) {
          config = await deps.graph.updateState(
            config,
            stateUpdate,
            "answer_candidate_questions",
          );
        } else {
          throw e;
        }
      }
      await deps.graph.invoke(null, config);
    } catch (e: any) {
      const isInterrupt =
        e?.name === "GraphInterrupt" ||
        e?.constructor?.name === "GraphInterrupt";
      if (!isInterrupt) queue.push({ type: "error", message: String(e) });
    } finally {
      try {
        const state = await deps.graph.getState(config);
        const values = state?.values as any;
        const isDone = isTerminalInterviewState(values);
        const dbState = parseStateJson(interview.stateJson);
        if (state?.values) {
          const currentLooksStale = shouldRestoreCheckpointFromDb(values, dbState);
          if (currentLooksStale) {
            console.warn("[streamAnswer] skip persisting stale checkpoint", {
              threadId: interview.threadId,
              checkpointStage: values?.currentStage,
              checkpointHistory: values?.answerHistory?.length,
              dbStage: dbState?.currentStage,
              dbHistory: dbState?.answerHistory?.length,
            });
            await deps.prisma.interview
              .update({
                where: { id: interviewId },
                data: { status: "in_progress", lastActiveAt: new Date() },
              })
              .catch(() => {});
          } else {
            await deps.prisma.interview
              .update({
                where: { id: interviewId },
                data: {
                  stateJson: values,
                  status: isDone ? "completed" : "in_progress",
                  endedAt: isDone ? new Date() : null,
                  lastActiveAt: new Date(),
                },
              })
              .catch(() => {});
          }
        }
      } catch {}
      if (dedupeKey) inFlightClientMessages.delete(dedupeKey);
      activeAnswerLocks.delete(interviewId);
      clearStreamingContext();
      clearActiveInterviewStream(interviewId, queue);
      queue.done();
    }
  });

  for await (const item of queue) yield item;
}

/** 面试 SSE 入口（恢复 / 回答统一路由） */
export async function* streamInterview(
  deps: SseDeps,
  interviewId: string,
  userMessage?: string,
  clientMessageId?: string,
) {
  if (userMessage) {
    yield* streamAnswer(deps, interviewId, userMessage, clientMessageId);
  } else {
    const activeStream = getActiveInterviewStream(interviewId);
    if (activeStream) {
      for await (const item of activeStream) yield item;
      return;
    }

    // 恢复路径：RedisSaver 直接返回当前阶段，前端通过 GET /state 做完整恢复
    const interview = await deps.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
    if (!interview) throw new Error("Interview not found");

    const config = { configurable: { thread_id: interview.threadId } };
    const state = await deps.graph.getState(config);

    if (hasRestorableStateValues(state?.values)) {
      const values = normalizeStateValues(state.values, (state as any).next);
      yield { type: "stage", stage: values.currentStage || "" };
    }
  }
}
