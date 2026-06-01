# 面试类型选择 — 设计文档

**日期:** 2026-06-01
**状态:** 待评审

## 需求概述

创建面试时选择"技术面"或"行为面"，一场面试只跑一种轮次，不同时出现技术和行为轮。同一个候选人可参加多场不同类型的面试。

## 数据模型

### Interview 表新增字段

```prisma
model Interview {
  // ... existing fields ...
  interviewType String @default("technical") // "technical" | "behavioral"
}
```

Candidate 表不变（邮箱唯一性保持）。

### Migration

```sql
ALTER TABLE "Interview" ADD COLUMN "interviewType" TEXT NOT NULL DEFAULT 'technical';
```

## 后端变更

### 1. Interview Controller (`server/src/interview/interview.controller.ts`)

`POST /api/interviews` 的 `create()` 方法接收 `interviewType` 字段：

```ts
@Post()
async create(@Body() body: { candidateId: string; positionId: string; interviewType: string }) {
  return this.interviewService.createInterview(body.candidateId, body.positionId, body.interviewType);
}
```

### 2. Interview Service (`server/src/interview/interview.service.ts`)

`createInterview()` 增加 `interviewType` 参数并写入 DB。

`streamStart()` 在 `initialState` 中传入 `interviewType`（从 Interview 记录读取）。

### 3. LangGraph State (`server/src/langgraph/state.ts`)

新增字段：

```ts
interviewType: Annotation<string>({
  reducer: (_, next) => next,
  default: () => 'technical',
}),
```

### 4. Graph 路由 (`server/src/langgraph/routing.ts`)

**routeAfterParse** — 新增路由函数，替代原先 `parse_resume → tech_select` 的硬编码边：

```ts
export function routeAfterParse(state: any): string {
  if (state.interviewType === 'behavioral') return 'behavioral_select';
  return 'tech_select';
}
```

**routeInTechnical** — 技术轮结束时的默认出口改为 `candidate_qa`（不再跳 behavioral）：

```ts
// 原: questionsAsked.length < maxQuestions → tech_next_topic
//     否则 → behavioral_select
// 改: 否则 → candidate_qa
```

### 5. Graph 装配 (`server/src/langgraph/interview.graph.ts`)

**parse_resume 出口** — 从硬编码边改为条件边：

```ts
// 原: .addEdge("parse_resume", "tech_select")
.addConditionalEdges("parse_resume", routeAfterParse, {
  tech_select: "tech_select",
  behavioral_select: "behavioral_select",
})
```

**tech_evaluate 条件边** — 默认出口从 `behavioral_select` 改为 `candidate_qa`：

```ts
// 原:
// .addConditionalEdges("tech_evaluate", routeInTechnical, {
//   tech_follow_up: "tech_follow_up",
//   tech_next_topic: "tech_next_topic",
//   behavioral_select: "behavioral_select",
// })

.addConditionalEdges("tech_evaluate", routeInTechnical, {
  tech_follow_up: "tech_follow_up",
  tech_next_topic: "tech_next_topic",
  candidate_qa: "candidate_qa",
})
```

### 6. 面试流程

**技术面：**
```
START → icebreaker → parse_resume → tech_select → tech_ask → tech_evaluate
    ↻ follow_up / next_topic
    → candidate_qa → generate_report → END
```

**行为面：**
```
START → icebreaker → parse_resume → behavioral_select → behavioral_ask → behavioral_evaluate
    ↻ follow_up / next_question
    → candidate_qa → generate_report → END
```

破冰、简历解析、候选人反问、生成报告 — 两种类型都保留。

## 前端变更

### CandidateList.vue

**"生成链接"按钮** — 点击时不再直接调用 API，改为弹出小型对话框让用户选择面试类型：

- 两个选项：技术面试 / 行为面试
- 选择后调用 `interviewsApi.create({ candidateId, positionId, interviewType })` 创建面试
- 面试创建成功后展示链接（与现有一致）

**面试链接列** — 在链接旁边展示类型 Tag（技术面 / 行为面），从 `row.interviews[0].interviewType` 读取。

### API Client (`client/src/api/client.ts`)

`interviewsApi.create()` 参数增加 `interviewType`：

```ts
create: (data: { candidateId: string; positionId: string; interviewType: string }) =>
  api.post('/interviews', data),
```

## 变更清单

| 层 | 文件 | 变更 |
|---|------|------|
| DB | `prisma/schema.prisma` | Interview 加 `interviewType` 字段 |
| DB | migration | `ALTER TABLE` 加列 |
| Server | `interview.controller.ts` | create body 加 `interviewType` |
| Server | `interview.service.ts` | `createInterview` / `streamStart` 传入 interviewType |
| Server | `state.ts` | 新增 `interviewType` 注解 |
| Server | `routing.ts` | 新增 `routeAfterParse`；`routeInTechnical` 默认出口改为 `candidate_qa` |
| Server | `interview.graph.ts` | `parse_resume` 出口改为条件边 |
| Client | `CandidateList.vue` | "生成链接"改为弹出选择框；链接列加类型 Tag |
| Client | `api/client.ts` | `interviewsApi.create` 加 `interviewType` |

## 边界与兼容性

- **已有面试**：`interviewType` 默认 `"technical"`，不存在 NULL 情况
- **简历解析**：技术面和行为面都跑解析，解析出的 `topics` 在行为面不参与选题，无副作用
- **候选人反问上限**：保持 5 个问题不变
- **报告**：现有报告模板覆盖两种类型；如果行为面没有技术评分，`techScore` 返回 0 或 N/A（LLM 自行判断）
