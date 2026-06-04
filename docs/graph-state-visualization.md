# 面试图状态可视化

## 1. 图结构总览

```mermaid
graph TD
    START((START)) --> icebreaker

    icebreaker["🧊 icebreaker<br/>破冰<br/>────────<br/>写: candidateIntro<br/>写: currentStage<br/>清: candidateAnswer"] --> parse_resume

    parse_resume["📄 parse_resume<br/>简历解析<br/>────────<br/>写: candidate<br/>写: techRound.topics"] --> tech_select

    tech_select["🎯 tech_select<br/>技术出题<br/>────────<br/>写: messages (题目)<br/>写: techRound<br/>写: currentStage"] --> tech_evaluate

    tech_evaluate["📊 tech_evaluate<br/>技术评估<br/>────────<br/>写: answerHistory<br/>写: scores.technical<br/>清: candidateAnswer<br/>⏸️ 中断等回答"] -->|回答浅显 + 深度<3| tech_follow_up
    tech_evaluate -->|还有剩余主题| tech_next_topic
    tech_evaluate -->|题量达标| candidate_qa

    tech_follow_up["🔁 tech_follow_up<br/>技术追问<br/>────────<br/>写: messages (追问)<br/>写: techRound.depth"] --> tech_evaluate

    tech_next_topic["⏭️ tech_next_topic<br/>下一主题<br/>────────<br/>写: techRound"] --> tech_select

    behavioral_select["🎯 behavioral_select<br/>行为出题<br/>────────<br/>写: messages (题目)<br/>写: behavioralRound<br/>写: currentStage"] --> behavioral_evaluate

    behavioral_evaluate["📊 behavioral_evaluate<br/>行为评估<br/>────────<br/>写: answerHistory<br/>写: scores.behavioral<br/>清: candidateAnswer<br/>⏸️ 中断等回答"] -->|回答模糊 + 深度<2| behavioral_follow_up
    behavioral_evaluate -->|还有剩余能力项| behavioral_next_question
    behavioral_evaluate -->|能力项耗尽| candidate_qa

    behavioral_follow_up["🔁 behavioral_follow_up<br/>行为追问<br/>────────<br/>写: messages (追问)<br/>写: behavioralRound.depth"] --> behavioral_evaluate

    behavioral_next_question["⏭️ behavioral_next_question<br/>下一能力项<br/>────────<br/>写: behavioralRound"] --> behavioral_select

    candidate_qa["💬 candidate_qa<br/>反问环节<br/>────────<br/>写: messages (回答)<br/>写: qaCount<br/>写: currentStage<br/>清: candidateAnswer<br/>⏸️ 中断等提问"] -->|qaCount ≥ 5| generate_report
    candidate_qa -->|qaCount < 5| candidate_qa

    generate_report["📝 generate_report<br/>生成报告<br/>────────<br/>写: messages (报告)<br/>写: scores (最终)<br/>写: currentStage='done'<br/>写: finalReport"] --> END((END))

    style icebreaker fill:#e3f2fd
    style parse_resume fill:#fff3e0
    style tech_select fill:#e8f5e9
    style tech_evaluate fill:#fce4ec
    style tech_follow_up fill:#f3e5f5
    style tech_next_topic fill:#e0f2f1
    style behavioral_select fill:#e8f5e9
    style behavioral_evaluate fill:#fce4ec
    style behavioral_follow_up fill:#f3e5f5
    style behavioral_next_question fill:#e0f2f1
    style candidate_qa fill:#fff9c4
    style generate_report fill:#ffccbc

    linkStyle default stroke-width:1.5px,fill:none,stroke:#999
```

## 2. 字段 × 节点矩阵

```
图例:  ✍ 写入(替换)  ➕ 追加  🔀 合并  📖 只读  🧹 清空  ⏸️ 中断点  · 不涉及
╔══════════════════════╦══════╦══════╦══════╦══════╦══════╦══════╦══════╦══════╦══════╦══════╦══════╦══════╗
║                      ║ 🧊   ║ 📄   ║ 🎯   ║ 📊   ║ 🔁   ║ ⏭️   ║ 🎯   ║ 📊   ║ 🔁   ║ ⏭️   ║ 💬   ║ 📝   ║
║       字段            ║icebrk║parse ║tech  ║tech  ║tech  ║tech  ║behav ║behav ║behav ║behav ║cand. ║gen.  ║
║                      ║      ║resume║select║eval  ║follow║next  ║select║eval  ║follow║next  ║qa    ║report║
╠══════════════════════╬══════╬══════╬══════╬══════╬══════╬══════╬══════╬══════╬══════╬══════╬══════╬══════╣
║ candidate            ║  ·   ║  ✍   ║  📖  ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  📖  ║
║ position             ║  ·   ║  📖  ║  📖  ║  ·   ║  ·   ║  ·   ║  📖  ║  ·   ║  ·   ║  ·   ║  📖  ║  📖  ║
║ currentStage         ║  ✍   ║  ·   ║  ✍   ║  ✍   ║  ✍   ║  ·   ║  ✍   ║  ✍   ║  ·   ║  ·   ║  ✍   ║  ✍   ║
║ candidateAnswer      ║  📖🧹║  ·   ║  ·   ║  📖🧹║  ·   ║  ·   ║  ·   ║  📖🧹║  ·   ║  ·   ║  📖🧹║  ·   ║
║ candidateIntro       ║  ✍   ║  ·   ║  📖  ║  ·   ║  ·   ║  ·   ║  📖  ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║
║ resumeText           ║  ·   ║  📖  ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║
║ interviewType        ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║
║ qaCount              ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  📖✍ ║  ·   ║
║ messages ➕           ║  ·   ║  ·   ║  ➕   ║  ·   ║  ➕   ║  ·   ║  ➕   ║  ·   ║  ➕   ║  ·   ║  ➕   ║  ➕   ║
║ answerHistory ➕      ║  ·   ║  ·   ║  ·   ║  ➕   ║  ·   ║  ·   ║  ·   ║  ➕   ║  ·   ║  ·   ║  ·   ║  📖  ║
║ scores 🔀            ║  ·   ║  ·   ║  ·   ║  🔀   ║  ·   ║  ·   ║  ·   ║  🔀   ║  ·   ║  ·   ║  ·   ║  🔀   ║
║ techRound            ║  ·   ║  ✍   ║  ✍   ║  📖  ║  ✍   ║  ✍   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║
║ behavioralRound      ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ·   ║  ✍   ║  📖  ║  ✍   ║  ✍   ║  ·   ║  ·   ║
╠══════════════════════╩══════╩══════╩══════╩══════╩══════╩══════╩══════╩══════╩══════╩══════╩══════╩══════╣
║ ⏸️ = interrupt() 中断点                                                                                  ║
║ 🧊=icebreaker 📄=parse_resume 🎯=select 📊=evaluate 🔁=follow_up ⏭️=next 💬=candidate_qa 📝=report     ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
```

## 3. 数据流向图

```mermaid
graph LR
    subgraph 外部输入
        DB[(数据库)] -->|position + candidate + resumeText| INIT
        USER[候选人输入] -->|candidateAnswer| GRAPH
    end

    subgraph 图的内部状态
        direction TB
        CAND[candidate<br/>简历解析结果] --> TS[tech_select<br/>根据技能/项目出题]
        TS --> TR[techRound<br/>当前题/深度/队列]
        TR --> TE[tech_evaluate<br/>评分]
        TE --> AH[answerHistory<br/>问答记录]
        TE --> SC[scores<br/>累计得分]
        TE -->|路由| NEXT{ }
        NEXT -->|追问| TF[tech_follow_up]
        NEXT -->|下一题| TN[tech_next_topic]
        NEXT -->|完成| QA[candidate_qa]
    end

    subgraph 外部输出
        MSG[messages<br/>推给前端展示] --> SSE([SSE])
        AH --> REPORT[generate_report<br/>汇总评估]
        SC --> REPORT
        REPORT --> FINAL([最终报告])
    end

    style DB fill:#e3f2fd
    style USER fill:#c8e6c9
    style SSE fill:#fff9c4
    style FINAL fill:#ffccbc
```

## 4. 节点读写热力图

```
读取频率 (📖 越多 = 越依赖全局状态)
─────────────────────────────────────────────
icebreaker:               ║█ ║  1个(candidateAnswer)
parse_resume:             ║██ ║  2个(position, resumeText)
tech_select:              ║███║  3个(candidate, position, candidateIntro)
tech_evaluate:            ║██ ║  2个(techRound, candidateAnswer)
tech_follow_up:           ║██ ║  2个(techRound, answerHistory)
tech_next_topic:          ║█ ║  1个(techRound)
behavioral_select:        ║██ ║  2个(position, candidateIntro)
behavioral_evaluate:      ║██ ║  2个(behavioralRound, candidateAnswer)
behavioral_follow_up:     ║█ ║  1个(answerHistory)
behavioral_next_question: ║█ ║  1个(behavioralRound)
candidate_qa:             ║███║  3个(candidateAnswer, qaCount, position)
generate_report:          ║███║  3个(candidate, position, answerHistory)

写入频率 (✍ 越多 = 副作用越大)
─────────────────────────────────────────────
icebreaker:               ║██ ║  2个(currentStage, candidateIntro)
parse_resume:             ║██ ║  2个(candidate, techRound)
tech_select:              ║██ ║  2个(messages, techRound)
tech_evaluate:            ║██ ║  2个(answerHistory, scores)
tech_follow_up:           ║██ ║  2个(messages, techRound)
tech_next_topic:          ║█ ║  1个(techRound)
behavioral_select:        ║██ ║  2个(messages, behavioralRound)
behavioral_evaluate:      ║██ ║  2个(answerHistory, scores)
behavioral_follow_up:     ║██ ║  2个(messages, behavioralRound)
behavioral_next_question: ║█ ║  1个(behavioralRound)
candidate_qa:             ║███║  3个(messages, qaCount, currentStage)
generate_report:          ║████║ 4个(messages, currentStage, scores, finalReport)
```

## 5. 三种 Reducer 行为

```
┌──────────────────────────────────────────────────────────────┐
│                      替换 (默认 reducer)                      │
│  currentStage  candidate  position  techRound  behavioralRound│
│  qaCount  candidateAnswer  resumeText  candidateIntro        │
│  interviewType                                               │
│                                                              │
│  新值直接覆盖旧值，不保留历史                                   │
│  例: currentStage = 'icebreaker' → 'technical' → 'qa'        │
├──────────────────────────────────────────────────────────────┤
│                      追加 (+) reducer                        │
│  messages  answerHistory                                     │
│                                                              │
│  reducer: (prev, next) => [...prev, ...next]                 │
│  新条目追加到数组末尾，不删除已有内容                            │
│  例: messages = [msg1, msg2] + [msg3] = [msg1, msg2, msg3]  │
├──────────────────────────────────────────────────────────────┤
│                      合并 ({}) reducer                       │
│  scores                                                      │
│                                                              │
│  reducer: (prev, next) => ({ ...prev, ...next })            │
│  新 key 覆盖旧 key，未提供的 key 保留原值                       │
│  例: {tech:0, behav:0} + {tech:7} = {tech:7, behav:0}       │
└──────────────────────────────────────────────────────────────┘
```

## 6. 三个中断点

```
ICE ⟳ ──────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  icebreaker → 等待用户自我介绍 → POST /message → 继续
 ───────────────────────────────────────────────── ─ ─

TECH ⟳ ──────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  tech_evaluate → 等待候选人回答 → POST /message → 继续
 ───────────────────────────────────────────────── ─ ─

BEHAV ⟳ ──────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  behavioral_evaluate → 等待候选人回答 → POST /message → 继续
 ───────────────────────────────────────────────── ─ ─

QA ⟳ ──────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  candidate_qa → 等待候选人提问 → POST /message → 继续
 ───────────────────────────────────────────────── ─ ─
```
