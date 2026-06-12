import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { createInterviewGraph } from "../langgraph/interview.graph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { randomBytes } from "node:crypto";
import { safeEqualHex, sha256Hex } from "../auth/token.util";
import {
  SseDeps,
  streamStart,
  streamAnswer,
  streamInterview,
  normalizeStateValues,
  asyncIterableToObservable,
  getActiveInterviewStream,
  hasRestorableStateValues,
} from "./interview-sse";

@Injectable()
export class InterviewService implements OnModuleInit {
  private graph: any;
  private checkpointer!: RedisSaver;
  private deps!: SseDeps;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const redisUrl = `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${Number(process.env.REDIS_PORT) || 6379}`;
    this.checkpointer = await RedisSaver.fromUrl(redisUrl, {
      defaultTTL: 86400,  // 24 小时 TTL，自动清理
      refreshOnRead: true, // 读取时刷新 TTL
    });
    this.graph = createInterviewGraph().compile({ checkpointer: this.checkpointer });
    this.deps = { graph: this.graph, prisma: this.prisma };
    console.log("[InterviewService] RedisSaver initialized, TTL=24h");
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
    const accessToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + Number(process.env.INTERVIEW_TOKEN_TTL_DAYS || 7) * 86400 * 1000);
    const interview = await this.prisma.interview.create({
      data: {
        candidateId,
        positionId,
        threadId,
        status: "pending",
        interviewType,
        accessTokenHash: sha256Hex(accessToken),
        accessTokenExpiresAt: expiresAt,
      } as any,
      include: { candidate: true, position: true },
    });
    return { ...interview, accessToken };
  }

  async assertInterviewAccess(interviewId: string, token?: string | null) {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new Error("Interview not found");
    const tokenHash = (interview as any).accessTokenHash as string | null;
    const expiresAt = (interview as any).accessTokenExpiresAt as Date | null;

    if (!token || !tokenHash || !expiresAt || expiresAt.getTime() <= Date.now()) {
      throw new Error("Interview token is invalid or expired");
    }
    if (!safeEqualHex(sha256Hex(token), tokenHash)) {
      throw new Error("Interview token is invalid or expired");
    }
  }

  async rotateInterviewAccessToken(interviewId: string) {
    const accessToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + Number(process.env.INTERVIEW_TOKEN_TTL_DAYS || 7) * 86400 * 1000);
    const interview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        accessTokenHash: sha256Hex(accessToken),
        accessTokenExpiresAt: expiresAt,
      } as any,
    });
    return { interviewId: interview.id, accessToken, accessTokenExpiresAt: expiresAt };
  }

  // ---- 状态查询（RedisSaver 主存储 + DB stateJson 兜底）----
  async getInterviewState(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
    if (!interview) throw new Error("Interview not found");

    const config = { configurable: { thread_id: interview.threadId } };
    let state = await this.graph.getState(config);

    // RedisSaver 兜底：检查是否丢数据，最后从 DB stateJson 恢复
    if (!hasRestorableStateValues(state?.values) && (interview as any).stateJson) {
      try {
        const json = typeof (interview as any).stateJson === 'string'
          ? JSON.parse((interview as any).stateJson)
          : (interview as any).stateJson;
        console.log('[getState] DB stateJson fallback:', json?.answerHistory?.length);
        await this.graph.updateState(config, json as any);
        state = await this.graph.getState(config);
      } catch {}
    }

    const values = hasRestorableStateValues(state?.values) ? normalizeStateValues(state.values, (state as any).next) : null;

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

  answerStream(interviewId: string, userMessage: string, clientMessageId?: string) {
    return streamAnswer(this.deps, interviewId, userMessage, clientMessageId);
  }

  answerStream$(interviewId: string, userMessage: string, clientMessageId?: string) {
    return asyncIterableToObservable(this.answerStream(interviewId, userMessage, clientMessageId));
  }

  interviewStream(interviewId: string, userMessage?: string, clientMessageId?: string) {
    return streamInterview(this.deps, interviewId, userMessage, clientMessageId);
  }

  interviewStream$(interviewId: string, userMessage?: string, clientMessageId?: string) {
    return asyncIterableToObservable(this.interviewStream(interviewId, userMessage, clientMessageId));
  }
}
