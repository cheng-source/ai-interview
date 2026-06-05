import { createStreamingContext, clearStreamingContext, getOrStartResumeParse } from "../langgraph/llm";
import { doParseResume } from "../langgraph/nodes/parse-resume.node";
import type { PrismaService } from "../prisma/prisma.service";
import type Redis from "ioredis";

const STATE_TTL = 86400;

/** 依赖注入——SSE 流式方法需要的共享资源 */
export interface SseDeps {
  graph: any;
  prisma: PrismaService;
  redis: Redis;
}

/** Redis 状态备份 */
export async function saveStateToRedis(deps: SseDeps, threadId: string) {
  try {
    const config = { configurable: { thread_id: threadId } };
    const state = await deps.graph.getState(config);
    if (state?.values) {
      await deps.redis.set(`interview:state:${threadId}`, JSON.stringify(state.values), "EX", STATE_TTL);
    }
  } catch (e) { console.error("Redis saveState failed:", (e as Error).message); }
}

export async function loadStateFromRedis(deps: SseDeps, threadId: string) {
  try {
    const raw = await deps.redis.get(`interview:state:${threadId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { console.error("Redis loadState failed:", (e as Error).message); return null; }
}

/** 后台异步解析简历（共享 Promise，仅预热 LLM 调用，结果由 parseResumeNode 写入 graph state） */
async function parseResumeAsync(deps: SseDeps, threadId: string, resumeText: string, jdText: string) {
  getOrStartResumeParse(threadId, () => doParseResume(resumeText, jdText, undefined, { silent: true })).catch(() => {});
}

/** 面试启动：invoke 驱动图执行，节点内部通过 pushEvent 自行推送 SSE 事件 */
export async function* streamStart(deps: SseDeps, interviewId: string, resumeText?: string) {
  const interview = await deps.prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, position: true },
  });
  if (!interview) throw new Error("Interview not found");

  const finalResumeText = resumeText || interview.candidate.resumeText || "";
  if (!finalResumeText) throw new Error("未找到简历内容");

  if (resumeText && !interview.candidate.resumeText) {
    deps.prisma.candidate.update({
      where: { id: interview.candidateId },
      data: { resumeText },
    }).catch(() => {});
  }

  const initialState = {
    threadId: interview.threadId,
    candidate: { name: interview.candidate.name, skills: [], experience: 0, projects: [], strengths: [], gaps: [] },
    position: {
      title: interview.position.title, department: interview.position.department,
      jdText: interview.position.jdText, techStack: interview.position.techStack, level: interview.position.level,
    },
    resumeText: finalResumeText,
    interviewType: interview.interviewType || 'technical',
    answerHistory: [{
      stage: 'icebreaker',
      question: { text: `${interview.candidate.name || '你好'}，我是今天的AI面试官。请先做一个简单的自我介绍吧。`, type: 'behavioral', topic: '自我介绍', difficulty: 1 },
    }],
  };

  const config = { configurable: { thread_id: interview.threadId } };
  console.log('[streamStart] initializing with answerHistory:', initialState.answerHistory?.length);
  const queue = createStreamingContext();

  parseResumeAsync(deps, interview.threadId, finalResumeText, interview.position.jdText);

  const graphTask = (async () => {
    try {
      await deps.graph.invoke(initialState, config);
    } catch (e: any) {
      const isInterrupt = e?.name === "GraphInterrupt" || e?.constructor?.name === "GraphInterrupt";
      if (!isInterrupt) queue.push({ type: "error", message: String(e) });
    } finally {
      await deps.prisma.interview.update({
        where: { id: interviewId },
        data: { status: "in_progress", startedAt: new Date(), lastActiveAt: new Date() },
      });
      try {
        const st = await deps.graph.getState(config);
        console.log('[streamStart] checkpoint state:', st?.values ? `answerHistory=${(st.values as any).answerHistory?.length}, stage=${(st.values as any).currentStage}` : 'null');
        if (st?.values) {
          await deps.prisma.interview.update({
            where: { id: interviewId },
            data: { stateJson: st.values as any },
          }).catch(() => {});
        }
      } catch {}
      await saveStateToRedis(deps, interview.threadId);
      clearStreamingContext();
      queue.done();
    }
  })();

  for await (const item of queue) yield item;
}

/** 候选人回答处理：updateState 注入回答 → invoke 恢复图执行 */
export async function* streamAnswer(deps: SseDeps, interviewId: string, userMessage: string) {
  const interview = await deps.prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, position: true },
  });
  if (!interview) throw new Error("Interview not found");

  deps.prisma.interview.update({ where: { id: interviewId }, data: { lastActiveAt: new Date() } }).catch(() => {});

  const config = { configurable: { thread_id: interview.threadId } };
  const queue = createStreamingContext();

  const graphTask = (async () => {
    try {
      await deps.graph.updateState(config, { candidateAnswer: userMessage });
      await deps.graph.invoke(null, config);
      // invoke 正常返回 → 图到达 END（面试完成）
      await deps.prisma.interview.update({
        where: { id: interviewId },
        data: { status: "completed", endedAt: new Date() },
      });
    } catch (e: any) {
      const isInterrupt = e?.name === "GraphInterrupt" || e?.constructor?.name === "GraphInterrupt";
      if (!isInterrupt) queue.push({ type: "error", message: String(e) });
    } finally {
      try {
        const state = await deps.graph.getState(config);
        if (state?.values) {
          await deps.prisma.interview.update({
            where: { id: interviewId },
            data: { stateJson: state.values as any },
          }).catch(() => {});
        }
      } catch {}
      await saveStateToRedis(deps, interview.threadId);
      clearStreamingContext();
      queue.done();
    }
  })();

  for await (const item of queue) yield item;
}

/** 面试 SSE 入口（恢复 / 回答统一路由） */
export async function* streamInterview(deps: SseDeps, interviewId: string, userMessage?: string) {
  if (userMessage) {
    yield* streamAnswer(deps, interviewId, userMessage);
  } else {
    // 恢复路径：仅返回当前阶段，前端通过 GET /state 做完整恢复
    const interview = await deps.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
    if (!interview) throw new Error("Interview not found");

    const config = { configurable: { thread_id: interview.threadId } };
    let state = await deps.graph.getState(config);

    if (!state?.values) {
      const saved = await loadStateFromRedis(deps, interview.threadId);
      if (saved) { await deps.graph.updateState(config, saved as any); state = await deps.graph.getState(config); }
    }

    if (state?.values) {
      yield { type: "stage", stage: (state.values as any).currentStage || "" };
    }
  }
}
