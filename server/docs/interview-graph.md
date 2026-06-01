# Interview Graph

```mermaid
flowchart TD
    START((START)) --> parse_resume["parse_resume<br/>简历解析"]
    parse_resume --> icebreaker["icebreaker<br/>破冰问候"]
    icebreaker --> tech_select["tech_select<br/>选题"]

    tech_select --> tech_ask["tech_ask<br/>出题"]
    tech_ask --> tech_evaluate["tech_evaluate<br/>评估 ⏸️"]

    tech_evaluate -->|"回答太浅 & depth < 3"| tech_follow_up["tech_follow_up<br/>追问"]
    tech_evaluate -->|"还有主题未考"| tech_next_topic["tech_next_topic<br/>下一主题"]
    tech_evaluate -->|"技术轮结束"| behavioral_select["behavioral_select<br/>选行为题"]

    tech_follow_up --> tech_evaluate
    tech_next_topic --> tech_select

    behavioral_select --> behavioral_ask["behavioral_ask<br/>出行为题"]
    behavioral_ask --> behavioral_evaluate["behavioral_evaluate<br/>评估 ⏸️"]

    behavioral_evaluate -->|"回答空洞 & depth < 2"| behavioral_follow_up["behavioral_follow_up<br/>追问"]
    behavioral_evaluate -->|"还有维度未问"| behavioral_next_question["behavioral_next_question<br/>下一题"]
    behavioral_evaluate -->|"行为轮结束"| candidate_qa["candidate_qa<br/>候选人提问"]

    behavioral_follow_up --> behavioral_evaluate
    behavioral_next_question --> behavioral_select

    candidate_qa -->|"qaCount < 5"| END((END))
    candidate_qa -->|"qaCount ≥ 5"| generate_report["generate_report<br/>生成报告"]
    generate_report --> END

    style tech_evaluate fill:#ef4444,color:#fff
    style behavioral_evaluate fill:#ef4444,color:#fff
    style START fill:#22c55e,color:#fff
    style END fill:#22c55e,color:#fff
```

## Routing Logic

### tech_evaluate → 三选一

```typescript
routeInTechnical(state):
  // 没有评估记录 → 回到 tech_ask（理论上不走）
  if (!lastRecord || lastRecord.stage !== 'technical') → tech_ask

  // 回答太浅 & 追问不超过 3 层 → 追问
  if (evaluation.isSurfaceLevel && depth < 3) → tech_follow_up

  // 还有主题没考完 → 换下一题
  if (questionsAsked.length < topics.length + 2) → tech_next_topic

  // 技术轮结束
  → behavioral_select
```

### behavioral_evaluate → 三选一

```typescript
routeInBehavioral(state):
  // 没有评估记录 → 回到 behavioral_ask
  if (!lastRecord || lastRecord.stage !== 'behavioral') → behavioral_ask

  // 回答空洞 & 追问不超过 2 层 → 追问
  if (evaluation.isVague && depth < 2) → behavioral_follow_up

  // 还有能力维度没问 → 换下一题
  if (questionsAsked.length < competencies.length) → behavioral_next_question

  // 行为轮结束
  → candidate_qa
```

### candidate_qa → 二选一

```typescript
routeAfterCandidateQA(state):
  qaCount >= 5 → generate_report
  否则 → END（允许候选人继续问）
```

## Marked with ⏸️ = interrupt point

Graph pauses at `interrupt()` calls in `tech_evaluate` and `behavioral_evaluate` when `candidateAnswer` is empty.
User answer resumes via `updateState` + `stream(null)`.
