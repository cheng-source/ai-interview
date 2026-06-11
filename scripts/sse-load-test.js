// =============================================================================
// SSE 长连接压测脚本 — AI 面试系统
//
// 为什么需要这个:
//   k6 和 wrk 擅长短连接 HTTP 请求，但 SSE（Server-Sent Events）是长连接
//   面试中最关键的接口就是 SSE 流（/interviews/:id/stream）
//   这个脚本模拟 N 个候选人同时面试，观察服务器能否扛住长连接
//
// 测试内容:
//   1. 同时建立 N 个 SSE 连接（模拟 N 个候选人在面试）
//   2. 每个连接维持 T 秒（持续接收 LLM 流式输出）
//   3. 每秒打印连接状态（活跃/关闭/错误/消息数）
//   4. 观察服务器内存、CPU、文件描述符数量
//
// 用法:
//   set INTERVIEW_ID=你的面试ID
//   set INTERVIEW_TOKEN=面试的accessToken
//   set CONNECTIONS=50          # 并发连接数，默认 20
//   set DURATION=30             # 持续时间秒，默认 30
//   node scripts/sse-load-test.js
//
// 获取测试数据:
//   # 方法 1: 用 curl 创建面试
//   curl -X POST http://localhost:3000/api/interviews \
//     -H "Content-Type: application/json" \
//     -H "Authorization: Bearer <你的admin token>" \
//     -d '{"candidateId":"xxx","positionId":"yyy","interviewType":"technical"}'
//   → 返回 { id, accessToken }
//
//   # 方法 2: 从数据库查已有的
//   cd server && node -e "
//     const {PrismaClient}=require('@prisma/client');
//     new PrismaClient().interview.findFirst().then(i=>console.log(i.id))
//   "
// =============================================================================

// =============================================================================
// 可配置参数 — 全部通过环境变量注入
// =============================================================================

// 后端地址，默认连本地
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';

// 面试 ID — 必须有，脚本启动时会检查
const INTERVIEW_ID = process.env.INTERVIEW_ID || '';

// 面试访问 token — 候选人端的鉴权凭据
const INTERVIEW_TOKEN = process.env.INTERVIEW_TOKEN || '';

// 并发 SSE 连接数 — 模拟同时面试的候选人数量
// 建议从小到大: 先试 10 → 50 → 100 → 200
const CONCURRENT_CONNECTIONS = Number(process.env.CONNECTIONS || 20);

// 压测持续时间（秒）
const DURATION_SECONDS = Number(process.env.DURATION || 30);

// =============================================================================
// 参数校验 — 缺参数时给出明确提示，不静默失败
// =============================================================================
if (!INTERVIEW_ID || !INTERVIEW_TOKEN) {
  console.error(`
  ╔══════════════════════════════════════════════════════════════╗
  ║  ⚠️  缺少必要参数                                              ║
  ║                                                              ║
  ║  请设置环境变量:                                               ║
  ║    set INTERVIEW_ID=面试的ID                                  ║
  ║    set INTERVIEW_TOKEN=面试的accessToken                      ║
  ║                                                              ║
  ║  可选:                                                        ║
  ║    set CONNECTIONS=50    并发连接数 (默认 20)                  ║
  ║    set DURATION=30       持续时间秒 (默认 30)                  ║
  ║                                                              ║
  ║  如何获取 interviewId + token:                                 ║
  ║    1. 登录 POST /api/auth/login                               ║
  ║    2. 创建面试 POST /api/interviews → 返回 accessToken        ║
  ║    3. 用返回的 id 和 accessToken 填到这里                       ║
  ╚══════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

// 拼接 SSE 流地址
// token 通过 URL query 参数传递（候选人端鉴权方式）
const streamUrl = `${BASE_URL}/interviews/${INTERVIEW_ID}/stream?token=${INTERVIEW_TOKEN}`;

// =============================================================================
// 统计状态
// 通过闭包维护，所有连接共享同一个 stats 对象
// 注意: 这不是线程安全的，但对压测脚本够用了
// =============================================================================
const stats = {
  started: 0,          // 已发起的连接数
  connected: 0,         // 当前活跃的 SSE 连接数（建立成功 - 已关闭）
  closed: 0,            // 正常关闭的连接数
  errored: 0,           // 异常（HTTP 错误 / 网络错误）
  bytesReceived: 0,     // 总共收到的字节数
  messagesReceived: 0,  // 收到的 SSE 消息数（以 "data:" 开头的行）
  startTime: 0,         // 测试开始时间戳
};

// =============================================================================
// pad(): 数字补空格对齐，打印表格用
// =============================================================================
function pad(v: number): string {
  return String(v).padStart(5);
}

// =============================================================================
// report(): 每秒打印一次当前状态
// 输出格式: [时间] 启动: N 活跃: N 关闭: N 错误: N 消息: N
// =============================================================================
function report() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  console.log(
    `[${elapsed.padStart(4)}s] ` +
    `启动:${pad(stats.started)} ` +
    `活跃:${pad(stats.connected)} ` +
    `关闭:${pad(stats.closed)} ` +
    `错误:${pad(stats.errored)} ` +
    `消息:${pad(stats.messagesReceived)}`,
  );
}

// =============================================================================
// oneConnection(): 单个 SSE 连接的生命周期
//
// 流程:
//   1. fetch() 发起 HTTP 连接 → 服务器返回 text/event-stream
//   2. ReadableStream reader 逐块读取数据
//   3. 解码字节流 → 拆行 → 统计 SSE 消息
//   4. 连接断开（服务器主动关闭 / 网络问题 / 测试结束）→ 更新统计
//
// SSE 协议简介:
//   text/event-stream 格式:
//     data: {"type":"token","content":"你好"}
//
//     data: {"type":"message","content":"..."}
//
//   每个 "data:" 开头的行为一条消息，空行分隔
// =============================================================================
async function oneConnection(id: number) {
  stats.started++;

  try {
    // ---- 发起 SSE 连接 ----
    // fetch() 不会自动解析 SSE，我们需要手动处理 ReadableStream
    const res = await fetch(streamUrl);

    // 非 2xx 响应 = 鉴权失败 / 面试不存在 / 服务器错误
    if (!res.ok) {
      console.error(`  [连接 ${id}] HTTP ${res.status} — 可能是 token 无效或面试不存在`);
      stats.errored++;
      return;
    }

    // 连接建立成功
    stats.connected++;

    // ---- 读取流式数据 ----
    // getReader() 返回 ReadableStreamDefaultReader
    // read() 返回 { done: boolean, value: Uint8Array }
    // done=true 表示流结束（服务器关闭连接）
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();  // UTF-8 解码器
    let buffer = '';  // 行缓冲区：跨 chunk 的不完整行暂存于此

    while (true) {
      const { done, value } = await reader.read();

      // 流结束 — 可能是服务器关闭、网络断开、或面试流程走完
      if (done) break;

      // 累计字节数（观察数据传输量）
      stats.bytesReceived += value.length;

      // 字节 → 字符串（stream: true 表示这是流式解码，不完整的多字节字符会被保留）
      buffer += decoder.decode(value, { stream: true });

      // ---- 拆行处理 ----
      // SSE 按行分隔，一个 chunk 可能包含多行，也可能一行跨多个 chunk
      // buffer 保存最后一行不完整部分，lines.pop() 取回
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      // 统计以 "data:" 开头的行为 SSE 消息
      for (const line of lines) {
        if (line.startsWith('data:')) {
          stats.messagesReceived++;
        }
      }
    }

    // 正常关闭
    stats.closed++;
  } catch (err: any) {
    // 网络错误: 连接被拒绝、超时、DNS 解析失败等
    console.error(`  [连接 ${id}] 网络异常: ${err.message}`);
    stats.errored++;
  } finally {
    // 无论正常还是异常，活跃连接数 -1
    stats.connected = Math.max(0, stats.connected - 1);
  }
}

// =============================================================================
// main(): 主控流程
// =============================================================================
async function main() {
  // ---- 打印启动信息 ----
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║           SSE 长连接压测                                      ║
  ║                                                              ║
  ║  并发连接: ${pad(CONCURRENT_CONNECTIONS)}                                             ║
  ║  持续时间: ${pad(DURATION_SECONDS)}s                                               ║
  ║  面试 ID:  ${INTERVIEW_ID.slice(0, 20)}...                                ║
  ╚══════════════════════════════════════════════════════════════╝
  `);

  stats.startTime = Date.now();

  // ---- 建立连接 ----
  // 逐个发起连接，间隔 50ms
  // 间隔的作用: 避免瞬间同时建连导致 TCP 半连接队列溢出（SYN flood 效应）
  // 50ms × 100 连接 = 5 秒内完成全部建连
  const connections: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
    connections.push(oneConnection(i));
    // 每个连接间隔 50ms 发起，让 TCP 三次握手分散
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`  所有 ${CONCURRENT_CONNECTIONS} 个连接已发起，持续 ${DURATION_SECONDS}s...\n`);

  // ---- 每秒报告状态 ----
  const reportTimer = setInterval(report, 1000);

  // ---- 等待指定时长 ----
  await new Promise((r) => setTimeout(r, DURATION_SECONDS * 1000));
  clearInterval(reportTimer);

  // ---- 汇总 ----
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`\n  ═══ ${elapsed}s 结果汇总 ═══`);
  report();
  console.log(`
  总数据接收:   ${(stats.bytesReceived / 1024 / 1024).toFixed(2)} MB
  总消息数:     ${stats.messagesReceived}
  平均带宽:     ${((stats.bytesReceived / 1024 / 1024) / Number(elapsed)).toFixed(2)} MB/s
  错误率:       ${(stats.errored / stats.started * 100).toFixed(1)}% (${stats.errored}/${stats.started})

  ══════════════════════════════════════════════════════
  📊 压测期间请另开终端观察:

  1. Node 进程:
     - 内存是否持续增长？（可能内存泄漏）
     - CPU 是否打满？（单线程瓶颈）

  2. PostgreSQL:
     docker exec -it interview-postgres-1 psql -U postgres -d interview
     SELECT count(*) FROM pg_stat_activity;  -- 活跃连接数

  3. Redis:
     docker exec -it interview-redis-1 redis-cli INFO clients  -- 连接数
     docker exec -it interview-redis-1 redis-cli DBSIZE        -- key 数量

  4. 修改参数对照测试:
     set CONNECTIONS=10  && node scripts/sse-load-test.js
     set CONNECTIONS=50  && node scripts/sse-load-test.js
     set CONNECTIONS=100 && node scripts/sse-load-test.js
     比较三次结果，找到系统连接数上限
  ══════════════════════════════════════════════════════
  `);

  process.exit(0);
}

// 启动
main();
