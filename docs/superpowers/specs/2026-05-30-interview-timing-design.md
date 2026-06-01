# Interview Timing Design

## Context

面试目前无时间压力，候选人可以无限思考。引入两层计时：
- **题目级倒计时**：LLM 根据难度给出时长，到期自动提交
- **总时长正向计时**：显示面试已进行多久

## Behavior

### 题目级倒计时

| 场景 | 行为 |
|------|------|
| 新题到达 | 从题目文本提取 `<!--time:N-->`（秒），启动倒计时 |
| 兜底换算 | 提取失败时按难度星数换算（★★=180s, ★★★=240s, ★★★★=300s, ★★★★★=420s） |
| LLM 出题期间 | 计时器启动后即开始走（含 LLM 生成下一题的时间） |
| 最后 30 秒 | 数字变红 + CSS 闪烁动画 |
| 归零 | 自动调用 sendAnswer，发送 textarea 中现有内容（可能为空），然后清输入框 |
| 手动提交 | 清除当前倒计时，等待下一题到达后启动新倒计时 |
| 进入 done 或 qa 阶段 | 停止题目倒计时 |
| icebreaker | 固定 120s |

### 总时长

| 场景 | 行为 |
|------|------|
| 进入面试 | started 时启动正向计时 |
| 进入 done | 停止计时，保留最终值 |
| 显示 | 顶部 bar 显示 "已用时 MM:SS" |

## UI Layout

```
┌──────────────────────────────────────────────┐
│ ●─●─●─●─●  技术面  已用时 05:32             │
├──────────────────────────────────────────────┤
│ **技术面试题** (Vue | 难度: ★★★★☆)          │
│ ...问题正文...                                │
│                           ⏱ 剩余 2:35        │
│                           ⏱ 剩余 0:18 🔴     │
├──────────────────────────────────────────────┤
│ [回答输入框]                          [发送] │
└──────────────────────────────────────────────┘
```

## Data Flow

```
LLM 出题（含 <!--time:300-->）
  ↓
Node return { messages, techRound: { currentQuestion: { timeLimit: 300 } } }
  ↓
Service → push message + token_end
  ↓
前端 readSSE: 收到消息 → 正则提取 timeLimit 或兜底换算
  ↓
启动 countdown = setInterval(1s)
  ↓  每秒递减
  countdown ≤ 30 → 变红闪烁
  countdown == 0 → sendAnswer(textarea内容)，clearInterval
```

## Backend Changes

### 1. Prompt 追加时间指令

技术题 System Prompt 末尾：
```
题目末尾以 <!--time:秒数--> 标注建议答题时间（参考：1★≈180s, 3★≈240s, 5★≈420s）。
```

行为题同样模式，参考：1★≈120s, 3★≈180s。

### 2. parseQuestionMeta 扩展

新增提取 `<!--time:N-->` 逻辑，解析失败时按难度兜底换算。

### 3. State 加字段

`currentQuestion` 增加 `timeLimit: number`（秒）。

### 4. Prompt 常量更新

`PROJECT_QUESTION_PROMPT`、`CONCEPT_QUESTION_PROMPT`、行为面 System Prompt 各追加时间指令行。

## Frontend Changes

### 1. InterviewSession.vue

- 顶部 bar：总时长正向计时 `已用时 MM:SS`
- 题目气泡旁：倒计时数字，≤30s 变红 + CSS `blink` 闪烁
- `watch` 或回调检测新消息到达 → 提取 timeLimit → 启动倒计时
- 倒计时归零 → 自动 sendAnswer

### 2. stores/interview.ts

- 新增 `questionTimeLimit`、`questionTimeRemaining`、`totalElapsed` 状态
- `startTimer(timeLimit)` 和 `stopTimer()` 方法
- 定时器生命周期与消息/阶段联动

## Edge Cases

| 情况 | 处理 |
|------|------|
| 文本中无 `<!--time:N-->` | 按 difficulty 星数换算兜底 |
| 定时器未启动时收到新消息 | 忽略（问答进行中） |
| 用户在最后一秒刚好点了发送 | 前端清除定时器，不发两次 |
| icebreaker | 固定 120s，不依赖 LLM |
| QA 反问阶段 | 无题目倒计时，仅总时长继续 |
| 面试完成 | 所有定时器停止，总时长定格 |
