import { z } from "zod";

// ---- 面试阶段 ----
export const StageEnum = z.enum(["icebreaker", "technical", "behavioral", "qa", "done"]);
export type Stage = z.infer<typeof StageEnum>;

// ---- 题目 ----
export const QuestionSchema = z.object({
  text: z.string(),
  type: z.enum(["technical", "behavioral"]),
  topic: z.string(),
  difficulty: z.number().min(1).max(5),
  timeLimit: z.number().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// ---- 评估 ----
export const EvaluationSchema = z.object({
  score: z.number().min(1).max(10),
  isCorrect: z.boolean(),
  isSurfaceLevel: z.boolean(),
  isVague: z.boolean().optional(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

// ---- 技能 ----
export const SkillCategorySchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

// ---- 项目经历 ----
export const ProjectExperienceSchema = z.object({
  name: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
});
export type ProjectExperience = z.infer<typeof ProjectExperienceSchema>;

// ---- SSE 事件（前端和后端通讯格式） ----
export const SSEEventType = z.enum([
  "status", "token", "token_end", "message", "evaluation", "stage", "done", "error", "llm_warning",
]);

export const SSEEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), content: z.string() }),
  z.object({ type: z.literal("token"), content: z.string() }),
  z.object({ type: z.literal("token_end") }),
  z.object({ type: z.literal("message"), content: z.string(), stage: z.string().optional() }),
  z.object({ type: z.literal("evaluation"), data: EvaluationSchema, stage: z.string().optional() }),
  z.object({ type: z.literal("stage"), stage: z.string() }),
  z.object({ type: z.literal("done"), report: z.any().optional() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("llm_warning"),
    code: z.string(),
    message: z.string(),
    personaId: z.string().optional(),
    attempt: z.number().optional(),
    providerId: z.string().optional(),
    model: z.string().optional(),
    baseURL: z.string().optional(),
    protocol: z.string().optional(),
    outputMode: z.string().optional(),
    failureKind: z.string().optional(),
  }),
]);
export type SSEEvent = z.infer<typeof SSEEventSchema>;

// ---- 聊天消息（前端渲染用） ----
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["interviewer", "candidate", "system"]),
  content: z.string(),
  stage: z.string().optional(),
  timestamp: z.number(),
  streaming: z.boolean().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ---- 面试状态 ----
export const InterviewStatusEnum = z.enum(["pending", "in_progress", "completed"]);
export type InterviewStatus = z.infer<typeof InterviewStatusEnum>;

// ---- 面试列表项 ----
export const InterviewListItemSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  positionId: z.string(),
  threadId: z.string(),
  status: InterviewStatusEnum,
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  lastActiveAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  candidate: z.object({ name: z.string(), email: z.string() }).optional(),
  position: z.object({ title: z.string() }).optional(),
});
export type InterviewListItem = z.infer<typeof InterviewListItemSchema>;

// ---- 候选人 ----
export const CandidateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "姓名不能为空"),
  email: z.string().email("邮箱格式不正确"),
  phone: z.string().min(1, "电话不能为空"),
  positionId: z.string().min(1, "请选择岗位"),
  resumeText: z.string().optional(),
  resumeUrl: z.string().optional(),
});
export type CandidateInput = z.infer<typeof CandidateSchema>;

// ---- 岗位 ----
export const PositionSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  jdText: z.string().min(1),
  techStack: z.array(z.string()),
  level: z.string(),
});
export type PositionInput = z.infer<typeof PositionSchema>;

// ---- 时间格式化工具 ----
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---- 难度→秒数换算 ----
export function difficultyToSeconds(difficulty: number): number {
  const map: Record<number, number> = { 1: 120, 2: 180, 3: 240, 4: 300, 5: 420 };
  return map[difficulty] ?? 240;
}
