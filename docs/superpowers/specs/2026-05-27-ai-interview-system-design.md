# AI 智能面试系统 — 设计规范

**日期:** 2026-05-27
**状态:** 设计已确认，待实施

---

## 项目概述

企业内部 HR 平台的 AI 智能面试系统。AI 作为全自动面试官，覆盖技术面试和行为面试，支持动态追问，包含完整的简历解析→开场破冰→技术轮→行为轮→候选人反问→综合报告流程。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Pinia + Monaco Editor |
| 后端 | NestJS + SSE (Server-Sent Events) |
| AI 编排 | `@langchain/langgraph` (StateGraph + Checkpoint + Interrupt) |
| LLM | `@langchain/core` + `@langchain/openai` |
| 数据库 | PostgreSQL + pgvector (向量) + Redis (会话/缓存) |
| ORM | Prisma |
| 语言 | TypeScript 全栈统一 |

## 架构总览

三层架构，全部 TypeScript，LangGraph 内嵌在 NestJS Service 中，无需独立部署。

```
Layer 1: Vue3 (候选人端) + Vue3 (HR管理端)
         ↕ SSE (流式推送) + REST (管理操作)
Layer 2: NestJS
         ├── Controllers / Services
         ├── Prisma ORM → PostgreSQL + pgvector + Redis
         └── LangGraph Interview Engine (核心)
              ├── StateGraph (面试流程编排)
              ├── Checkpoint (状态持久化/断线恢复)
              └── Tools (简历解析 / RAG检索 / 报告生成)
         ↕
Layer 3: LLM Provider / Embedding / 语音(可选) / 代码沙箱(可选)
```

## StateGraph 设计

### 节点列表

| 节点 | 职责 | 工具 |
|---|---|---|
| `parse_resume` | 解析简历，提取技能、项目经验、年限 | resume_parser |
| `icebreaker` | 基于简历生成个性化开场白 | — |
| `tech_select` | 基于 JD 技能要求 + 难度递增，LLM 动态生成题目 | — |
| `tech_ask` | 发送题目并推送代码编辑器 | — |
| `tech_evaluate` | 评估答案正确性、深度、知识盲区 | — |
| `tech_follow_up` | 针对不完整回答生成追问 | — |
| `tech_next_topic` | 切换到下一个技术领域 | — |
| `behavioral_select` | 基于技术轮表现选择行为题 | — |
| `behavioral_ask` | 以 STAR 方法论引导回答 | — |
| `behavioral_evaluate` | 评估逻辑、沟通、自驱等维度 | — |
| `behavioral_follow_up` | 针对空洞回答要求举例 | — |
| `behavioral_next_question` | 切换能力维度 | — |
| `candidate_qa` | 候选人反问 + RAG 公司知识检索 | retrieve_company_info |
| `generate_report` | 综合评分 + 能力画像 + 录用建议 | report_generator |

### 条件边 (路由逻辑)

**技术轮路由 `routeInTechnical`:**

- `follow_up` — 回答深度不足 + 追问次数 < 3 → 继续深挖当前知识点
- `next_topic` — 深度已达阈值 or 追问次数 ≥ 3 → 切换到下一个技术领域
- `END_TECH` — 所有技术领域已覆盖 → 进入行为轮

**行为轮路由 `routeInBehavioral`:**

- `follow_up` — 回答空洞缺实例 + 追问次数 < 2 → 要求补充具体案例
- `next_question` — 回答完整清晰 → 切换下一个能力维度
- `END_BEHAV` — 所有能力维度已覆盖 → 进入反问环节

**反问路由 `shouldContinueQA`:**

- `continue` — 候选人继续提问 + 已答 < 5 个
- `end` — 候选人表示"没了" or 已回答 ≥ 5 个

### 追问策略区别

| 维度 | 技术轮 | 行为轮 |
|---|---|---|
| 最大追问深度 | 3 层 | 2 层 |
| 追问触发条件 | 答案有盲区/错误 | 回答空洞无具体案例 |
| 追问目的 | 探测知识边界 | 引导给出具体实例 |

技术轮问得更深——知识盲区值得深挖。行为轮追问更节制——避免让候选人有被审问的感觉。

### InterviewState

```typescript
interface InterviewState {
  candidate: {
    name: string
    skills: string[]
    experience: number
    projects: string[]
    strengths: string[]
    gaps: string[]
  }
  currentStage: 'icebreaker' | 'technical' | 'behavioral' | 'qa' | 'done'
  techRound: {
    currentTopic: string
    currentQuestion: Question | null
    questionsAsked: Question[]
    depth: number
    topics: string[]
  }
  behavioralRound: {
    currentQuestion: Question | null
    questionsAsked: Question[]
    depth: number
    competencies: string[]
  }
  answerHistory: Array<{
    stage: string
    question: Question
    answer: string
    evaluation: Evaluation
  }>
  scores: {
    technical: number
    behavioral: number
    overall: number
  }
  messages: BaseMessage[]
  qaCount: number
}
```

## Checkpoint 机制

- 每个节点执行后自动持久化状态到 PostgreSQL
- 候选人断线后重连，从最近 checkpoint 恢复
- `thread_id` = interview.id，确保状态隔离

## RAG 设计 (候选人反问阶段)

### 适用场景

候选人提问涉及公司内部信息（福利制度、技术栈、团队架构、企业文化等），LLM 知识截止日期后无法回答。

### 检索流程

```
候选人提问 → 问题分类 → 涉及公司信息?
  ├── 是 → retrieve_company_info Tool Call → pgvector 检索 top-3 → 基于文档回答
  └── 否 → LLM 直接礼貌回复
```

### 技术选型

| 组件 | 选型 | 备注 |
|---|---|---|
| 向量数据库 | pgvector | PostgreSQL 扩展，与业务数据同库 |
| Embedding | text-embedding-3-small | 便宜够用，后续可换本地模型 |
| 文档加载 | @langchain/community loaders | PDF / DOCX / MD / TXT |
| 分块策略 | chunk_size=500, overlap=50 | 适合 FAQ 和制度类文档 |

### 文档管理

HR 在管理端上传公司文档 → NestJS KnowledgeModule 预处理（加载→分块→Embedding→写入 pgvector）→ 即时可用。

## 前端设计

### 候选人端

- **面试大厅:** 倒计时/准备页 → 进入面试
- **对话界面:** 消息气泡流 + 代码编辑器（技术题时展开 Monaco Editor）
- **语音输入:** 可选按钮，长按录音，松开发送
- **进度指示:** 当前阶段标签（破冰中 / 技术面 / 行为面 / 反问 / 完成）
- **报告页:** 面试结束后展示评分和评语摘要

### HR 管理端

- **岗位管理:** 创建/编辑岗位，配置 JD、技能要求、面试流程模板
- **公司文档:** 上传/管理 RAG 知识库文档
- **候选人管理:** 邀请候选人，查看面试记录
- **报告看板:** 面试报告详情，评分对比，导出 PDF

## 数据模型

```
Candidate (候选人)
  id, name, email, phone, resumeUrl, resumeParsed(JSON)
  positionId, status

Position (岗位)
  id, title, department, jdText, techStack[], level

Interview (面试)
  id, candidateId, positionId, threadId
  stateJson, status, startedAt, endedAt

CompanyDoc (公司文档)
  id, title, content, chunks[]
  embedding(pgvector), category, uploadedAt

Report (面试报告)
  id, interviewId, candidateId
  techScore, behavScore, overallScore
  strengths[], weaknesses[], summary, recommendation
```

## 通信设计

- **实时对话:** SSE 单向流，逐 token 推送 LLM 输出；客户端通过 POST 发送消息
- **管理操作:** REST API，JWT 鉴权
- **心跳:** SSE 注释行 `:ping` 保活
- **断线恢复:** EventSource 自动重连 + 重连后从 checkpoint 恢复状态

## 不做的事 (MVP 范围外)

- 语音/视频面试 — 架构预留，MVP 不实现
- 代码沙箱在线运行 — 架构预留，MVP 用静态代码展示
- 多租户 SaaS — 按单企业部署设计
- 候选人反问时通用闲聊 — 限定为公司相关问题 + 礼貌拒绝越界问题

## 依赖清单

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.x",
    "@langchain/langgraph": "^0.2.x",
    "@langchain/openai": "^0.3.x",
    "@langchain/community": "^0.3.x",
    "@nestjs/common": "^10.x",
    "@prisma/client": "^5.x",
    "ioredis": "^5.x",
    "pdf-parse": "^1.x",
    "mammoth": "^1.x"
  },
  "devDependencies": {
    "prisma": "^5.x",
    "@nestjs/cli": "^10.x"
  }
}
```
