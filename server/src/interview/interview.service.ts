import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { createInterviewGraph } from "../langgraph/interview.graph";
import { MemorySaver } from "@langchain/langgraph";
import Redis from "ioredis";
import {
  SseDeps,
  saveStateToRedis,
  loadStateFromRedis,
  streamStart,
  streamAnswer,
  streamInterview,
  normalizeStateValues,
  asyncIterableToObservable,
  getActiveInterviewStream,
} from "./interview-sse";

@Injectable()
export class InterviewService {
  private graph: any;
  private checkpointer: MemorySaver;
  private redis: Redis;
  private deps: SseDeps;

  constructor(private prisma: PrismaService) {
    this.checkpointer = new MemorySaver();
    this.graph = createInterviewGraph().compile({ checkpointer: this.checkpointer });
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
    });
    this.deps = { graph: this.graph, prisma: this.prisma, redis: this.redis };
  }

  // ---- 面试 CRUD ----
  async findAll() {
    return this.prisma.interview.findMany({
      include: { candidate: true, position: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createInterview(candidateId: string, positionId: string, interviewType: string) {
    const threadId = `interview-${Date.now()}`;
    return this.prisma.interview.create({
      data: { candidateId, positionId, threadId, status: "pending", interviewType },
      include: { candidate: true, position: true },
    });
  }

  // ---- 状态查询 ----
  async getInterviewState(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
    if (!interview) throw new Error("Interview not found");

    const config = { configurable: { thread_id: interview.threadId } };
    let state = await this.graph.getState(config);
    console.log('[getState] MemorySaver:', state?.values ? `answerHistory=${(state.values as any).answerHistory?.length}` : 'null');

    if (!state?.values) {
      const saved = await loadStateFromRedis(this.deps, interview.threadId);
      console.log('[getState] Redis:', saved ? `answerHistory=${saved.answerHistory?.length}` : 'null');
      if (saved) { await this.graph.updateState(config, saved as any); state = await this.graph.getState(config); }
    }

    // MemorySaver + Redis 都丢了，最后兜底 DB 里的 stateJson
    if (!state?.values && (interview as any).stateJson) {
      try {
        const json = typeof (interview as any).stateJson === 'string'
          ? JSON.parse((interview as any).stateJson)
          : (interview as any).stateJson;
        console.log('[getState] DB stateJson:', json?.answerHistory?.length);
        await this.graph.updateState(config, json as any);
        state = await this.graph.getState(config);
      } catch {}
    }

    const values = state?.values ? normalizeStateValues(state.values, (state as any).next) : null;

    return {
      state: values,
      status: interview.status,
      startedAt: interview.startedAt,
      hasActiveStream: !!getActiveInterviewStream(interviewId),
      interviewType: interview.interviewType || 'technical',
      resumeText: interview.candidate.resumeText || (values as any)?.resumeText || null,
      candidate: {
        name: interview.candidate.name,
        email: interview.candidate.email || '',
        phone: interview.candidate.phone || '',
      },
      position: {
        title: interview.position.title,
        department: interview.position.department || '',
      },
    };
  }

  // ---- 简历文件解析 ----
  async extractResumeText(file: Express.Multer.File): Promise<string> {
    const mimetype = file.mimetype;
    const ext = file.originalname?.split(".").pop()?.toLowerCase();

    if (mimetype === "application/pdf" || ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(file.buffer);
      return data.text || "";
    }
    if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value || "";
    }
    if (mimetype === "application/msword" || ext === "doc") {
      const { default: WordExtractor } = await import("word-extractor");
      const extractor = new WordExtractor();
      const doc = await extractor.extract(file.buffer);
      return doc.getBody() || "";
    }
    return file.buffer.toString("utf-8");
  }

  // ---- SSE 流式代理 ----
  startStream(interviewId: string, resumeText?: string) {
    return streamStart(this.deps, interviewId, resumeText);
  }

  startStream$(interviewId: string, resumeText?: string) {
    return asyncIterableToObservable(this.startStream(interviewId, resumeText));
  }

  answerStream(interviewId: string, userMessage: string) {
    return streamAnswer(this.deps, interviewId, userMessage);
  }

  answerStream$(interviewId: string, userMessage: string) {
    return asyncIterableToObservable(this.answerStream(interviewId, userMessage));
  }

  interviewStream(interviewId: string, userMessage?: string) {
    return streamInterview(this.deps, interviewId, userMessage);
  }

  interviewStream$(interviewId: string, userMessage?: string) {
    return asyncIterableToObservable(this.interviewStream(interviewId, userMessage));
  }
}
