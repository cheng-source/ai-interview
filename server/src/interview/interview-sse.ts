import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createStreamingContext, clearStreamingContext, getOrStartResumeParse } from "../langgraph/llm";
import { doParseResume } from "../langgraph/nodes/parse-resume.node";
import type { PrismaService } from "../prisma/prisma.service";
import type Redis from "ioredis";

const TEXT_NODES = new Set(["tech_follow_up", "behavioral_follow_up", "candidate_qa", "tech_select", "behavioral_select"]);
const FORMAT_NODES = new Set(["tech_ask", "behavioral_ask", "generate_report"]);
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

/** 处理 graph.stream() 的每个 chunk，push 到 queue */
function processChunk(chunk: any, queue: any) {
  const nodeName = Object.keys(chunk)[0];
  const nodeData = chunk[nodeName] as any;

  if (nodeData?.messages?.length && FORMAT_NODES.has(nodeName)) {
    for (const msg of nodeData.messages) {
      if (msg.content) queue.push({ type: "message", content: msg.content, stage: nodeName });
    }
  }
  if (nodeData?.messages?.length && TEXT_NODES.has(nodeName)) {
    queue.push({ type: "token_end" });
  }
  if (nodeData?.currentStage) {
    queue.push({ type: "stage", stage: nodeData.currentStage });
  }
}

/** 面试启动 SSE 流 */
export async function* streamStart(deps: SseDeps, interviewId: string, resumeText?: string) {
  const interview = await deps.prisma.interview.findUnique({
    where: { id: interviewId },
    include: { candidate: true, position: true },
  });
  if (!interview) throw new Error("Interview not found");

  const finalResumeText = resumeText || interview.candidate.resumeText || "";
  if (!finalResumeText) throw new Error("未找到简历内容");

  // 如果简历来自请求体但候选人记录中没有，写回 DB 以便刷新恢复
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
  };

  const config = { configurable: { thread_id: interview.threadId } };
  const queue = createStreamingContext();

  const greeting = `${interview.candidate.name || '你好'}，我是今天的AI面试官。请先做一个简单的自我介绍吧。`;
  queue.push({ type: "message", content: greeting, stage: "icebreaker" });
  queue.push({ type: "stage", stage: "icebreaker" });

  // 将 greeting 写入 graph state，刷新时可恢复
  deps.graph.updateState(config, {
    messages: [new AIMessage(greeting)],
    currentStage: "icebreaker",
  }).catch(() => {});

  parseResumeAsync(deps, interview.threadId, finalResumeText, interview.position.jdText);

  const graphTask = (async () => {
    try {
      const stream = await deps.graph.stream(initialState, config);
      for await (const chunk of stream) processChunk(chunk, queue);
    } catch (e: any) {
      const isInterrupt = e?.name === "GraphInterrupt" || e?.constructor?.name === "GraphInterrupt";
      if (!isInterrupt) queue.push({ type: "error", message: String(e) });
    } finally {
      await deps.prisma.interview.update({
        where: { id: interviewId },
        data: { status: "in_progress", startedAt: new Date(), lastActiveAt: new Date() },
      });
      // 每次 interrupt 都存 stateJson 到 DB，确保重启可恢复
      try {
        const st = await deps.graph.getState(config);
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

/** 候选人回答处理 SSE 流 */
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
      await deps.graph.updateState(config, { candidateAnswer: userMessage, messages: [new HumanMessage(userMessage)] });
      const stream = await deps.graph.stream(null, config);
      for await (const chunk of stream) {
        const nodeName = Object.keys(chunk)[0];
        const nodeData = chunk[nodeName] as any;

        if (nodeData?.answerHistory?.length) {
          const ev = nodeData.answerHistory[nodeData.answerHistory.length - 1];
          queue.push({ type: "evaluation", data: ev.evaluation, stage: ev.stage });
        }
        if (nodeData?.messages?.length && FORMAT_NODES.has(nodeName)) {
          for (const msg of nodeData.messages) {
            if (msg.content) queue.push({ type: "message", content: msg.content, stage: nodeName });
          }
        }
        if (nodeData?.messages?.length && TEXT_NODES.has(nodeName)) queue.push({ type: "token_end" });
        if (nodeData?.currentStage) queue.push({ type: "stage", stage: nodeData.currentStage });

        if (nodeData?.currentStage === "done") {
          queue.push({ type: "done", report: nodeData.finalReport });
          await deps.prisma.interview.update({
            where: { id: interviewId },
            data: { status: "completed", endedAt: new Date(), stateJson: nodeData },
          });
        }
      }
    } catch (e) {
      queue.push({ type: "error", message: String(e) });
    } finally {
      // 每次 interrupt 都存 DB，确保刷新/重启可恢复
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

/** 面试状态恢复 / 流式入口 */
export async function* streamInterview(deps: SseDeps, interviewId: string, userMessage?: string) {
  if (userMessage) {
    yield* streamAnswer(deps, interviewId, userMessage);
  } else {
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
      const values = state.values as any;
      if (values.messages?.length) {
        for (const msg of values.messages.slice(-3)) {
          if (msg.content) yield { type: "message", content: msg.content, stage: values.currentStage };
        }
      }
    }
  }
}
