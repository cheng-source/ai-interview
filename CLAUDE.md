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

## 环境变量

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interview
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
OPENAI_API_KEY=<deepseek-api-key>
OPENAI_BASE_URL=https://api.deepseek.com/v1   # 或其他 OpenAI 兼容端点
PORT=3000
```

## 项目结构

```
client/                          前端（Vue 3）
  src/
    api/client.ts                 Axios 实例 + 所有 API 方法（职位、候选人、面试、知识库、报告）
    stores/interview.ts           Pinia store：消息管理、SSE 解析、计时器、startInterview/sendAnswer
    stores/timer.ts               Composable：题目倒计时 + 总耗时，解析 LLM 输出中的 [time] N
    views/candidate/              InterviewSession.vue — 两步流程：确认信息 → 开始对话
    views/admin/                  管理后台：Dashboard、CandidateList、PositionList/Form、CompanyDocs
    components/                   ChatBubble、ProgressIndicator、CodeEditor、AdminLayout
    router/index.ts               /interview/:id、/admin/* 路由（懒加载）
    types/index.ts                ChatMessage、PositionInfo 等接口定义

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

## 面试流程图

```
START → icebreaker（破冰） → parse_resume（解析简历） → tech_select（选题） → tech_ask（提问） → tech_evaluate（评估） ⏸️
                    ↓
  tech_evaluate → tech_follow_up（追问） → tech_evaluate        （回答浅显 且 追问深度<3）
  tech_evaluate → tech_next_topic（下一主题） → tech_select      （还有剩余主题）
  tech_evaluate → behavioral_select（进入行为面）                （技术面结束）
                    ↓
  behavioral_select → behavioral_ask → behavioral_evaluate ⏸️
                    ↓
  behavioral_evaluate → behavioral_follow_up → behavioral_evaluate   （回答模糊 且 追问深度<2）
  behavioral_evaluate → behavioral_next_question → behavioral_select （还有剩余能力项）
  behavioral_evaluate → candidate_qa（反问环节）                      （行为面结束）
                    ↓
  candidate_qa → candidate_qa（循环，qaCount<5） → generate_report（生成报告） → END
```

⏸️ = 中断点。当 `candidateAnswer` 为空时图暂停；候选人发送消息后通过 `updateState` + `stream(null)` 恢复执行。

**路由阈值**：技术追问最大深度=3，行为追问最大深度=2，反问环节最多 5 个问题。技术面覆盖所有候选人项目 + 最多 2 道概念题。

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
LLM 输出 `[time] N`（如 `[time] 240`）来设置题目倒计时。前端 `timer.ts` composable 通过 `tryStartTimer(text)` 解析此标记。难度→秒数映射：1→120、2→180、3→240、4→300、5→420。

### Thinking 模式兼容性
DeepSeek v4-pro 的 `thinking` 模式不支持 `tool_choice`（LangChain `withStructuredOutput` 所需）。代码中的应对方案：
- 所有结构化输出使用基于 prompt 的 JSON 提取（`zodToJsonTemplate`）替代 function calling
- 知识库搜索使用原生 SQL（`$queryRawUnsafe`）替代 `bindTools` 向量搜索
