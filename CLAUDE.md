# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指导。

## 技术栈

**前端:** Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS + Element Plus
**后端:** NestJS + Prisma + PostgreSQL（pgvector）+ Redis + LangGraph
**大模型:** DeepSeek-v4-pro，通过 OpenAI 兼容 API 调用

## 常用命令

```bash
# 前端（端口 5173）
cd client && npm run dev       # 启动开发服务器
cd client && npm run build     # 生产构建

# 后端（端口 3000）
cd server && npm run dev       # nest start --watch（热重载）
cd server && npm run build     # tsc 编译

# 数据库（Docker）
docker-compose up -d           # 启动 postgres:5432 + redis:6379

# Prisma
cd server && npx prisma migrate dev --name <名称>   # 生成迁移
cd server && npx prisma db push                      # 直接同步 schema（不生成迁移文件）
```

## 项目结构

```
client/                          前端（Vue 3）
  src/
    api/                          API 接口定义（按模块拆分，barrel export）
      client.ts                   Axios 实例 + createSSERequest + readSSEStream
      index.ts                    统一导出
    assets/                       静态资源
    components/                   公共组件：ChatBubble、ProgressIndicator、CodeEditor
    composables/                  组合式函数
      useTimer.ts                 题目倒计时 + 总耗时，解析 LLM 输出中的 [time] N
      useInterviewSession.ts      面试会话流程：确认信息 → 开始对话 → 发送回答
    layouts/                      布局组件
      AdminLayout.vue             管理后台布局（侧边栏由路由 meta 自动生成）
      InterviewSidebar.vue        面试侧边栏（AI 状态 + 成绩单）
    router/index.ts               /interview/:id、/admin/* 路由（懒加载 + meta 驱动侧边栏）
    stores/interview.ts           Pinia store：消息管理、SSE 解析、startInterview/sendAnswer
    types/index.ts                ChatMessage、PositionInfo 等接口定义
    utils/                        工具函数：format、restore
    views/                        页面组件
      admin/                      管理后台：Dashboard、CandidateList、PositionList/Form、CompanyDocs
      candidate/                  候选端：InterviewSession + 子组件

server/                          后端（NestJS）
  src/
    main.ts                       启动入口：CORS（允许 origin:5173）、ValidationPipe、端口 3000
    app.module.ts                 ConfigModule + 6 个功能模块
    shared/schema.ts              Zod schema：SSEEvent、Question、Evaluation、CandidateInfo — 共享类型
    prisma/                       PrismaService + 数据模型（Position、Candidate、Interview、CompanyDoc）
    interview/                    面试 CRUD、SSE 流式推送、简历解析（pdf/docx/doc）
    interview/interview-sse.ts    SSE 核心逻辑：streamStart、streamAnswer、streamInterview
    langgraph/
      interview.graph.ts          图组装：13 个节点，条件边
      state.ts                    LangGraph Annotation 状态（15 个字段，含 reducer）
      routing.ts                  条件边路由逻辑（技术面→追问/下一题/行为面，行为面→追问/下一题/反问，反问→报告/结束）
      llm.ts                      LLM 工厂（ChatOpenAI）、TokenQueue 异步迭代器、StreamingHandler、简历解析去重缓存
      nodes/                      每个图节点对应一个 async 函数
      personas/                   PersonaDefinition（id、systemPrompt、temperature、streaming、outputMode、Zod schema）
```

## 代码规范

- 前端所有 API 请求必须通过 \`src/api/\` 下的模块，禁止在组件里直接写 \`fetch\`

## 核心架构模式

### Persona（角色）系统

所有 LLM 调用均通过 `persona-executor.ts` 中的 `executePersona(persona, userMessage)` 执行。每个 persona 是一个 `PersonaDefinition`，包含：

- `outputMode: 'text'` — 流式 token 直接推送至 SSE
- `outputMode: 'structured'` — LLM 返回 JSON，按 Zod schema 解析，不流式输出

Persona 文件位于 `server/src/langgraph/personas/*.persona.ts` — 每个节点角色一个文件。persona 执行器处理了 `withStructuredOutput` 的降级方案（基于 prompt 的 JSON 提取替代 function calling，以规避 DeepSeek thinking 模式的报错）。

### SSE 协议

服务端向客户端推送的事件类型：`status`、`token`、`token_end`、`message`、`evaluation`、`stage`、`done`、`error`。前端 Pinia store（`interview.ts`）解析各类事件：

- `token`/`token_end` — 流式 LLM 输出，增量追加到最后一条消息
- `message` — 完整消息（用于非流式节点，如 tech_select）
- `evaluation` — 每次回答后的评分
- `stage` — 当前面试阶段变化
- `done` — 最终报告

### 状态持久化（三级降级）

1. **MemorySaver**（主） — LangGraph 的内存检查点
2. **Redis**（TTL 24 小时） — 通过 `saveStateToRedis`/`loadStateFromRedis` 备份
3. **数据库 `stateJson` 字段** — 最终兜底，每次中断/错误时写入

恢复时，`getInterviewState` 按上述顺序依次尝试。Interview 模型携带 `threadId`（每次面试唯一）作为 LangGraph 线程标识。

### 简历解析去重

`llm.ts` 中的 `getOrStartResumeParse(threadId, fn)` 确保简历 LLM 调用只执行一次 — `streamStart` 中的异步预热和 `parse_resume` 节点中的同步调用共享同一个 Promise。完成后，解析结果缓存供后续调用者使用。

### 计时器协议

LLM 输出 `[time] N`（如 `[time] 240`）来设置题目倒计时。前端 `composables/useTimer.ts` 中的 `tryStartTimer(text)` 解析此标记。难度→秒数映射：1→120、2→180、3→240、4→300、5→420。

### Thinking 模式兼容性

DeepSeek v4-pro 的 `thinking` 模式不支持 `tool_choice`（LangChain `withStructuredOutput` 所需）。代码中的应对方案：

- 所有结构化输出使用基于 prompt 的 JSON 提取（`zodToJsonTemplate`）替代 function calling
- 知识库搜索使用原生 SQL（`$queryRawUnsafe`）替代 `bindTools` 向量搜索

### API 层规范

所有 HTTP/SSE 请求必须通过 `src/api/<module>.ts` 模块发起，**禁止在组件 / Hook / Store 中直接使用 `fetch` / `axios` / `EventSource`**。

每个 API 文件按**三段式**组织，后端模块与 API 文件一一对应：

```typescript
// ========== 1. 类型定义 ==========
export interface XxxDto { id: string; ... }

// ========== 2. xxxApi 命名空间对象 ==========
import { api, createSSERequest } from './client';
export const xxxApi = {
  list: () => api.get<XxxDto[]>('/xxx'),           // REST 走 axios
  stream: (id, token) => createSSERequest(...),    // SSE 流式走 fetch
};

// ========== 3. 默认导出 ==========
export default xxxApi;
```

**文件清单**（`client/src/api/`）：

| 文件 | 对应后端模块 | 请求类型 |
|------|-------------|----------|
| `client.ts` | 共享基础（Axios 实例 + `createSSERequest` + `readSSEStream`） | — |
| `auth.ts` | AuthModule | REST |
| `position.ts` | PositionModule | REST |
| `candidate.ts` | CandidateModule | REST + 文件上传 |
| `interview.ts` | InterviewModule | REST + **SSE 流式** |
| `knowledge.ts` | KnowledgeModule | REST + 文件上传 |
| `report.ts` | ReportModule | REST |
| `llm-provider.ts` | LlmProviderModule | REST |
| `index.ts` | 统一导出（barrel export） | — |

**SSE 流式封装**：候选面试的 `startStream` / `sendMessage` / `resumeStream` 返回 `{ response: Promise<Response>, abort: () => void }`，Store 层通过 `readSSEStream(response, handlers)` 消费事件流，不在 Store 内做 `fetch` 或原始 SSE 解析。

**调用方式**：
```typescript
// 命名导入（推荐）
import { interviewApi } from '@/api';
// 或默认导入
import interviewApi from '@/api/interview';
```
