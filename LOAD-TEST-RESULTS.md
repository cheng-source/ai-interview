# 压测结果

**测试时间**: 2026-06-12（重新实测）  
**测试环境**: Windows 11, Node.js 22.17, NestJS 单进程  
**后端地址**: http://localhost:3100/api  

---

## 一、REST API 读接口压测

**脚本**: `scripts/node-load-test.js`  
**接口**: 职位列表、候选人列表、报告列表、LLM Provider、知识库搜索  
**鉴权**: Bearer JWT（admin 登录后的 token）

| 并发 VU | 总请求  | 成功率  | 吞吐量    | avg    | P50    | P95     | P99     |
|---------|---------|---------|-----------|--------|--------|---------|---------|
| 20      | 1,938   | 100%    | 64 req/s  | 8ms    | 6ms    | 13ms    | 89ms    |
| 50      | 3,217   | 100%    | 158 req/s | 9ms    | 5ms    | 15ms    | 153ms   |
| 100     | 6,533   | 100%    | 319 req/s | 6ms    | 4ms    | 10ms    | 105ms   |
| 200     | 9,737   | 100%    | 628 req/s | 10ms   | 5ms    | 14ms    | 227ms   |
| 500     | 14,272  | 100%    | 1346 req/s| 56ms   | 40ms   | 169ms   | 453ms   |
| 1000    | 10,433  | 100%    | 1159 req/s| 510ms  | 454ms  | 1380ms  | 1489ms  |

### 结论

- **200 并发以内**: P95 稳定在 10-14ms，吞吐线性增长，毫无压力
- **500 并发**: 拐点出现，P95 跳至 169ms，但吞吐仍在增长（1346/s）
- **1000 并发**: Node.js 事件循环饱和，P95 飙至 1.4s，吞吐反而下降

**实用建议**: 单机在 200-500 并发区间表现最好。超过 500 建议 PM2 cluster 多进程。

---

## 二、面试流程压测（Mock LLM）

**脚本**: `scripts/interview-load-test.js`  
**模式**: `LLM_MOCK=true`（跳过真实 LLM 调用，用假数据替代）  
**流程**: POST /start → SSE 流推送 icebreaker → parse_resume → tech_select → LangGraph 中断

| 并发 | 状态 | 建连 P50 | 建连 P95 | 整体 P50 | 整体 P95 |
|------|------|----------|----------|----------|----------|
| 10   | ✓    | 125ms    | 151ms    | 170ms    | 172ms    |
| 20   | ✓    | 73ms     | 133ms    | 168ms    | 171ms    |
| 50   | ✓    | 192ms    | 299ms    | 350ms    | 369ms    |
| 100  | ✓    | 337ms    | 534ms    | 626ms    | 680ms    |
| 200  | ✓    | 629ms    | 964ms    | 1186ms   | 1281ms   |

> 全部并发档位零失败，100% 成功。

### 指标说明

| 指标 | 含义 | 包含节点 |
|------|------|----------|
| **建连延迟** | POST /start → 首个 SSE 事件到达 | SSE 建连 + 同步事件入队 |
| **整体耗时** | POST /start → SSE 流关闭（中断点） | SSE 建连 + collect_self_introduction（纯模板，无 LLM）+ checkpoint 写入 + Redis 备份 + DB 更新 |

> ⚠️ 旧版报告中的"首包/破冰"实为同一指标（差 1-2ms），此处合并为"建连延迟"。
> ⚠️ 第一段 graph.invoke 仅执行 collect_self_introduction 就 interrupt，analyze_resume / ask_technical_question 在后续 POST /message 时才执行。

### 瓶颈分析

200 并发 P95=1281ms 的耗时拆解（全部是系统基础设施，无 LLM 参与）：

| 组件 | 操作 |
|------|------|
| LangGraph | 图初始化、状态创建、1 个模板节点（collect_self_introduction）、checkpoint 写入 |
| Prisma | 更新 interview 记录（status/startedAt/stateJson） |
| Redis | 状态备份（saveStateToRedis） |
| SSE | HTTP 长连接建立、推送 2-4 个事件 |
| Node.js | 单线程事件循环处理 200 个并发 Promise |

### 与旧版对比

```
              旧版 (6/11)  新版 (6/12)
              ───────────  ───────────
 10 并发 P95:  163ms         172ms  （持平）
 20 并发 P95:  281ms         171ms  （39% ↓）
 50 并发 P95:  659ms         369ms  （44% ↓）
100 并发 P95: 1025ms         680ms  （34% ↓）
200 并发 P95: 1854ms        1281ms  （31% ↓）
```

> 新版显著优于旧版，可能原因：代码优化（如 API 层拆分后的模块加载效率）、旧版端口不通导致的部分重试开销消除。

### 结论

- **50 并发以内**: 体验流畅（P95 < 370ms）
- **100 并发**: 可接受（P95 ~680ms）
- **200 并发**: 有感知延迟但零失败（P95 ~1.3s）
- **全部测试零失败**: LangGraph + SSE 架构在高并发下稳定

---

## 三、系统瓶颈总结

| 层级 | 瓶颈点 | 当前表现 | 优化方向 |
|------|--------|----------|----------|
| Node.js | 单线程事件循环 | 200 并发面试 P95=1.3s | PM2 cluster 多进程 |
| PostgreSQL | 连接池 | 未观测到瓶颈 | 连接池大小调优 |
| Redis | 状态备份 | 未观测到瓶颈 | 无需优化 |
| LangGraph | 图初始化 + 模板节点 + checkpoint | 200 并发 P95=1.3s | 减少同步写入 |
| LLM API | Mock 模式（未测试真实延迟） | — | 需真实 LLM 压测 |

---

## 四、后续建议

1. **真实 LLM 压测** — 设 `LLM_MOCK=false`，小并发（3-5）测 LLM API 延迟和限流
2. **完整面试流程压测** — 模拟 POST /message 多轮对话，覆盖 parse_resume / tech_select / tech_evaluate 节点
3. **SSE 长连接压测** — 用 `scripts/sse-load-test.js` 测并发长连接数上限
4. **PM2 多进程** — 如果单机 200+ 并发面试是常态需求，加 PM2 cluster 模式线性扩展
