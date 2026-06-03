# AI 面试侧边栏 — 设计文档

## 概述

在面试问答页面的聊天框右侧新增一个侧边栏，实时展示 AI 状态和答题成绩单，让候选人清晰感知面试进度和表现。

## 布局方案

采用 **Tab 切换布局**，侧边栏宽度 260px，位于聊天区域右侧，通过 flex 横排布局与聊天区并排。

```
┌──────────────────────────────────────┬──────────────┐
│  ProgressIndicator  │  已用时 05:23  │              │
├──────────────────────────────────────┤   Tab 切换    │
│                                      │ ┌──────────┐ │
│        聊天消息区域                    │ │🤖 AI状态  │ │
│        （flex-1, 可滚动）              │ │📊 成绩单  │ │
│                                      │ └──────────┘ │
│                                      │              │
│                                      │  对应内容区   │
│                                      │              │
├──────────────────────────────────────┤              │
│  [输入框]                    [发送]   │              │
└──────────────────────────────────────┴──────────────┘
```

移动端（屏幕 < 768px）隐藏侧边栏，保持现有布局。

## Tab 1 — AI 状态（默认显示）

### 内容区块（从上到下）

1. **SSE 连接状态** — 绿色圆点 + "SSE 连接正常" / 红色 + "连接已断开"
2. **当前阶段卡片** — 脉冲蓝点 + 阶段名（技术面/行为面/反问）+ 当前题目简述
3. **实时执行状态** — 旋转加载图标 + 状态文字（如"分析回答中..."、"生成下一题..."）
4. **执行流程时间线** — 节点列表，每项显示 ✓/● 图标 + 名称 + 时间戳（恢复时不显示时间）
   - 示例：✓ 破冰 → ✓ 简历解析 → ✓ Q1: 技术栈介绍 → ✓ Q1 评估(7.5) → ● Q2: 高并发·提问中
5. **面试进度条** — 分段色块表示各阶段占比（破冰/技术面/行为面/反问），已完成=绿色，进行中=蓝色，待进行=灰色

### 数据来源

| 内容 | 数据来源 |
|---|---|
| 连接状态 | `store.isConnected` |
| 当前阶段 | `store.currentStage` |
| 实时状态文字 | `store.statusText`（SSE `status` 事件）|
| 时间线 | `store.stageLog[]` — 新增数组，记录 `{ label, time, type }` |
| 进度条 | 根据 `currentStage` + `stageLog` 推算 |

## Tab 2 — 成绩单

### 内容区块（从上到下）

1. **均分大盘** — 大号数字 + 进度条 + 已完成题数
2. **评分卡片列表**（可滚动）— 每题一张卡片：
   - 题号 + 题目 + 分数（绿色 ≥7，橙色 5-6，红色 <5）
   - 评语摘要
   - 维度标签（技术深度、系统设计、表达、经验等）
3. **等待占位** — 虚线边框 + "等待 Q3 回答..."

### 数据来源

| 内容 | 数据来源 |
|---|---|
| 评分卡片 | `store.evaluations[]` — 新增数组，记录 `{ questionText, score, summary, stage, dimensions }` |
| 均分 | 从 `evaluations` 计算 |
| 已答题数 | `evaluations.length` |

## 数据恢复方案

### 问题

页面刷新或断线重连时，侧边栏的 `stageLog` 和 `evaluations` 数据需要从后端恢复。

### 解决方案

**无需修改后端**。现有 LangGraph checkpoint 状态已包含足够数据，在 `tryResume()` 中新增重建逻辑。

### 具体策略

**evaluations 重建：**
- 源数据：`state.answerHistory[]`，每项包含 `question`、`evaluation`
- 方法：遍历 `answerHistory`，对每条有 `evaluation` 的记录生成一个 sidebar 评分条目
- 字段映射：`questionText = item.question.text`，`score = item.evaluation.score`，`summary = item.evaluation.summary`

**stageLog 重建：**
- 源数据：`state.messages`、`state.answerHistory`、`state.currentStage`
- 方法：按以下规则推断已完成节点：
  - `messages` 不为空 → 破冰已完成
  - `candidate` 有内容 → 简历解析已完成
  - 遍历 `answerHistory` → 每个条目生成两个节点：`"Q{n}: {topic}"` + `"Q{n} 评估 ({score})"`
  - `currentStage` → 标记当前进行中的阶段
- 恢复时不显示具体时间戳，只显示顺序和阶段名称

### store 新增字段

```typescript
// 执行流程时间线
stageLog: ref<Array<{label: string; time?: string; type: 'completed' | 'active'}>>([])

// 评分记录
evaluations: ref<Array<{questionText: string; score: number; summary: string; stage: string}>>([])
```

### cleanup 时重置

`store.cleanup()` 中同时清空 `stageLog` 和 `evaluations`。

## 涉及文件

### 新增文件
- `client/src/components/InterviewSidebar.vue` — 侧边栏组件（Tab 切换 + 两个面板内容）

### 修改文件
- `client/src/stores/interview.ts` — 新增 `stageLog`、`evaluations` 状态，在 SSE 事件处理和 `cleanup` 中维护
- `client/src/views/candidate/InterviewSession.vue` — 布局改为 flex 横排，引入侧边栏组件，在 `tryResume()` 中重建侧边栏数据

### 不需要修改
- `server/` — 无后端变更
- `client/src/types/index.ts` — 数据类型简单，无需新增接口定义
- `client/src/router/index.ts` — 路由不变

## 验证方式

1. **启动完整环境**：`docker-compose up -d` + `cd server && npm run dev` + `cd client && npm run dev`
2. **创建面试**：在管理后台创建一个面试，获取面试链接
3. **进行面试**：完成破冰 → 技术面答 2-3 题，观察侧边栏实时更新
4. **Tab 切换**：确认"AI 状态"和"成绩单"两个 Tab 正常切换
5. **刷新恢复**：在面试过程中刷新页面，确认侧边栏数据完整恢复
6. **断线重连**：停止后端，发送一条消息触发错误，重启后端后继续面试，确认侧边栏数据恢复
7. **移动端**：缩小浏览器窗口至 < 768px，确认侧边栏隐藏
