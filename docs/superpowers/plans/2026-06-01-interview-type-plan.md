# 面试类型选择 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建面试时选择"技术面"或"行为面"，一场面试只跑一种轮次。

**Architecture:** Interview 表新增 `interviewType` 字段，从 Controller → Service → Graph State → Routing 逐层传递。Graph 的 `parse_resume` 出口按类型分叉跳过技术轮；`tech_evaluate` 技术轮结束直接进入 QA（不再进入行为轮）。

**Tech Stack:** Prisma + NestJS + LangGraph + Vue 3 + Pinia

---

## 文件变更总览

| 文件 | 操作 |
|------|------|
| `server/prisma/schema.prisma` | 修改 — Interview 加字段 |
| `server/src/interview/interview.controller.ts` | 修改 — create body |
| `server/src/interview/interview.service.ts` | 修改 — createInterview + streamStart |
| `server/src/langgraph/state.ts` | 修改 — 新增 annotation |
| `server/src/langgraph/routing.ts` | 修改 — 新增 routeAfterParse + 改 routeInTechnical |
| `server/src/langgraph/interview.graph.ts` | 修改 — 两条边 |
| `client/src/api/client.ts` | 修改 — interviewsApi.create 签名 |
| `client/src/views/admin/CandidateList.vue` | 修改 — 类型选择对话框 + 列表 Tag |

---

### Task 1: Prisma Schema — Interview 表加 interviewType

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: 在 Interview model 中新增字段**

在 `server/prisma/schema.prisma` 的 `model Interview` 块中，`status` 字段后新增一行：

```prisma
model Interview {
  id            String    @id @default(uuid())
  candidateId   String
  positionId    String
  threadId      String    @unique
  stateJson     Json?
  status        String    @default("pending")
  interviewType String    @default("technical") // ← 新增：technical | behavioral
  startedAt     DateTime?
  endedAt       DateTime?
  lastActiveAt  DateTime?
  candidate     Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  position      Position  @relation(fields: [positionId], references: [id])
  createdAt     DateTime  @default(now())
}
```

- [ ] **Step 2: 运行 migration**

```bash
cd server && npx prisma migrate dev --name add_interview_type
```

Expected: 生成 migration SQL 文件，数据库自动添加列。

- [ ] **Step 3: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add interviewType field to Interview model"
```

---

### Task 2: Interview Controller — create 接口接收 interviewType

**Files:**
- Modify: `server/src/interview/interview.controller.ts`

- [ ] **Step 1: 修改 create() 方法签名**

将 `server/src/interview/interview.controller.ts` 第 16-18 行的 `create()` 方法改为：

```ts
@Post()
async create(@Body() body: { candidateId: string; positionId: string; interviewType: string }) {
  return this.interviewService.createInterview(body.candidateId, body.positionId, body.interviewType);
}
```

原代码：
```ts
@Post()
async create(@Body() body: { candidateId: string; positionId: string }) {
  return this.interviewService.createInterview(body.candidateId, body.positionId);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/interview/interview.controller.ts
git commit -m "feat: accept interviewType in POST /api/interviews"
```

---

### Task 3: Interview Service — createInterview + streamStart 传入 interviewType

**Files:**
- Modify: `server/src/interview/interview.service.ts`
- Modify: `server/src/interview/interview-sse.ts`

- [ ] **Step 1: 修改 createInterview()**

将 `server/src/interview/interview.service.ts` 第 40-46 行的 `createInterview` 方法改为：

```ts
async createInterview(candidateId: string, positionId: string, interviewType: string) {
  const threadId = `interview-${Date.now()}`;
  return this.prisma.interview.create({
    data: { candidateId, positionId, threadId, status: "pending", interviewType },
    include: { candidate: true, position: true },
  });
}
```

- [ ] **Step 2: 修改 streamStart() 的 initialState**

在 `server/src/interview/interview-sse.ts` 中找到 `streamStart` 函数内的 `initialState` 对象（约第 78-86 行），添加 `interviewType`：

原代码：
```ts
const initialState = {
  threadId: interview.threadId,
  candidate: { name: interview.candidate.name, skills: [], experience: 0, projects: [], strengths: [], gaps: [] },
  position: {
    title: interview.position.title, department: interview.position.department,
    jdText: interview.position.jdText, techStack: interview.position.techStack, level: interview.position.level,
  },
  resumeText: finalResumeText,
};
```

改为：
```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add server/src/interview/interview.service.ts server/src/interview/interview-sse.ts
git commit -m "feat: pass interviewType through service to graph initial state"
```

---

### Task 4: LangGraph State — 新增 interviewType annotation

**Files:**
- Modify: `server/src/langgraph/state.ts`

- [ ] **Step 1: 在 InterviewStateAnnotation 中新增字段**

在 `server/src/langgraph/state.ts` 的 `InterviewStateAnnotation` 对象末尾（`candidateIntro` 之后、右括号之前）添加：

```ts
interviewType: Annotation<string>({
  reducer: (_, next) => next,
  default: () => 'technical',
}),
```

- [ ] **Step 2: Commit**

```bash
git add server/src/langgraph/state.ts
git commit -m "feat: add interviewType to LangGraph state annotations"
```

---

### Task 5: Graph Routing — 新增 routeAfterParse + 修改 routeInTechnical

**Files:**
- Modify: `server/src/langgraph/routing.ts`

- [ ] **Step 1: 替换已有的 routeAfterParse 函数**

`server/src/langgraph/routing.ts` 中已有 `routeAfterParse` 函数（旧定义为 `return 'icebreaker'`，未被 graph 使用，属于死代码）。将其替换为：

```ts
export function routeAfterParse(state: any): string {
  if (state.interviewType === 'behavioral') return 'behavioral_select';
  return 'tech_select';
}
```

- [ ] **Step 2: 修改 routeInTechnical 默认出口**

将 `server/src/langgraph/routing.ts` 中 `routeInTechnical` 函数的最后一行返回值从 `'behavioral_select'` 改为 `'candidate_qa'`：

```ts
// 原: return 'behavioral_select';
// 改:
return 'candidate_qa';
```

即最后几行变为：
```ts
  if (questionsAsked.length < maxQuestions) {
    return 'tech_next_topic';
  }

  return 'candidate_qa';
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/langgraph/routing.ts
git commit -m "feat: add routeAfterParse, route tech exit to candidate_qa"
```

---

### Task 6: Graph Assembly — parse_resume 条件边 + tech_evaluate 出口修正

**Files:**
- Modify: `server/src/langgraph/interview.graph.ts`

- [ ] **Step 1: 确认导入**

`server/src/langgraph/interview.graph.ts` 已导入 `routeAfterParse`（第 24 行），无需修改 import 语句。Task 5 中已将其函数体重写为实际路由逻辑。

- [ ] **Step 2: 将 parse_resume 出口改为条件边**

将第 55 行 `.addEdge("parse_resume", "tech_select")` 改为条件边：

```ts
.addConditionalEdges("parse_resume", routeAfterParse, {
  tech_select: "tech_select",
  behavioral_select: "behavioral_select",
})
```

- [ ] **Step 3: 修改 tech_evaluate 条件边的默认出口**

将第 59-63 行的 tech_evaluate 条件边中的 `behavioral_select: "behavioral_select"` 改为 `candidate_qa: "candidate_qa"`：

```ts
.addConditionalEdges("tech_evaluate", routeInTechnical, {
  tech_follow_up: "tech_follow_up",
  tech_next_topic: "tech_next_topic",
  candidate_qa: "candidate_qa",
})
```

- [ ] **Step 4: Commit**

```bash
git add server/src/langgraph/interview.graph.ts
git commit -m "feat: conditional parse_resume edge, tech_evaluate exits to candidate_qa"
```

---

### Task 7: API Client — interviewsApi.create 加 interviewType

**Files:**
- Modify: `client/src/api/client.ts`

- [ ] **Step 1: 修改 create 方法签名**

将 `client/src/api/client.ts` 第 31-32 行的 `create` 方法改为：

```ts
export const interviewsApi = {
  list: () => api.get('/interviews'),
  create: (data: { candidateId: string; positionId: string; interviewType: string }) =>
    api.post('/interviews', data),
  // ... 其余不变
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/client.ts
git commit -m "feat: add interviewType to interviewsApi.create"
```

---

### Task 8: CandidateList.vue — 类型选择对话框 + 列表 Tag

**Files:**
- Modify: `client/src/views/admin/CandidateList.vue`

- [ ] **Step 1: 添加面试类型选择弹窗的状态变量**

在 `<script setup>` 区块中（第 73 行附近），与其他 ref 声明并列添加：

```ts
const interviewTypeDialogVisible = ref(false);
const interviewTypeTarget = ref<any>(null);
const selectedInterviewType = ref('technical');
```

- [ ] **Step 2: 修改 createInterviewFor 函数**

将原来的 `createInterviewFor`（第 152-155 行）改为弹出类型选择对话框：

```ts
function createInterviewFor(c: any) {
  interviewTypeTarget.value = c;
  selectedInterviewType.value = 'technical';
  interviewTypeDialogVisible.value = true;
}
```

- [ ] **Step 3: 新增 confirmCreateInterview 函数**

在 `createInterviewFor` 函数后面添加：

```ts
async function confirmCreateInterview() {
  if (!interviewTypeTarget.value) return;
  await interviewsApi.create({
    candidateId: interviewTypeTarget.value.id,
    positionId: interviewTypeTarget.value.positionId,
    interviewType: selectedInterviewType.value,
  });
  interviewTypeDialogVisible.value = false;
  interviewTypeTarget.value = null;
  await refresh();
}
```

- [ ] **Step 4: 在"面试链接"列显示类型 Tag**

将模板中第 22-24 行的链接展示改为加类型 Tag：

原代码：
```html
<span class="text-xs text-gray-400 max-w-52 truncate inline-block align-middle mr-2">
  {{ `${BASE}/interview/${row.interviews[0].id}` }}
</span>
```

改为：
```html
<span class="text-xs text-gray-400 max-w-52 truncate inline-block align-middle mr-2">
  {{ `${BASE}/interview/${row.interviews[0].id}` }}
</span>
<el-tag size="small" :type="row.interviews[0].interviewType === 'behavioral' ? 'warning' : ''" class="mr-2">
  {{ row.interviews[0].interviewType === 'behavioral' ? '行为面' : '技术面' }}
</el-tag>
```

- [ ] **Step 5: 添加类型选择对话框模板**

在现有编辑对话框 `<el-dialog>`（第 48-69 行）之后，新增一个类型选择对话框：

```html
<el-dialog v-model="interviewTypeDialogVisible" title="选择面试类型" width="360px">
  <el-radio-group v-model="selectedInterviewType" class="flex flex-col gap-3">
    <el-radio value="technical" size="large">技术面试</el-radio>
    <el-radio value="behavioral" size="large">行为面试</el-radio>
  </el-radio-group>
  <template #footer>
    <el-button @click="interviewTypeDialogVisible = false">取消</el-button>
    <el-button type="primary" @click="confirmCreateInterview">确认生成</el-button>
  </template>
</el-dialog>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/views/admin/CandidateList.vue
git commit -m "feat: add interview type selection dialog and tag in candidate list"
```

---

### Task 9: 集成验证

- [ ] **Step 1: 启动后端确认无编译错误**

```bash
cd server && npm run dev
```

Expected: NestJS 启动成功，无 TypeScript 编译错误。

- [ ] **Step 2: 启动前端确认无编译错误**

```bash
cd client && npm run dev
```

Expected: Vite 启动成功，无编译错误。

- [ ] **Step 3: 手动验证完整流程**

1. 打开管理端 `http://localhost:5173/admin/candidates`
2. 点击"生成链接"→ 弹出类型选择对话框
3. 选择"技术面试"→ 点击确认 → 列表显示"技术面"Tag + 链接
4. 选择"行为面试"→ 点击确认 → 列表显示"行为面"Tag + 链接
5. 拷贝技术面链接打开 → 确认面试流程只有技术轮
6. 拷贝行为面链接打开 → 确认面试流程只有行为轮

- [ ] **Step 4: Commit（如有修复）**
