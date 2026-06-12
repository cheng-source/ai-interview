// =============================================================================
// 面试全流程压测脚本
//
// 覆盖完整面试链路:
//   START → icebreaker(模板) → analyze_resume(LLM) → tech_select(LLM)
//   → 候选人回答 → tech_evaluate(LLM) → 追问/下一题 → ...
//   → behavioral(LLM) → 回答 → evaluate → ...
//   → candidate_qa(RAG 知识库检索 + LLM 回答) → 反问多轮
//   → generate_final_report(LLM) → DONE
//
// 自动在每次 SSE 中断后发 POST /message 推进，直至 done 事件
//
// 两档:
//   Mock 模式（LLM_MOCK=true）: 测系统基础设施，可高并发完整流程
//   真实模式（LLM_MOCK=false）: 测 LLM API 延迟 + RAG 检索，低并发
//
// 用法:
//   node scripts/interview-full-flow-test.js           # 自动 prepare + run
//   node scripts/interview-full-flow-test.js prepare 5
//   CONCURRENT=5 node scripts/interview-full-flow-test.js run
//   CONCURRENT=5 LLM_REAL=true node scripts/interview-full-flow-test.js run
// =============================================================================

var BASE_URL = process.env.BASE_URL || 'http://localhost:3100/api';
var CONCURRENT = parseInt(process.env.CONCURRENT || '5', 10);
var LLM_REAL = process.env.LLM_REAL === 'true';
var MAX_TURNS = parseInt(process.env.MAX_TURNS || '30', 10); // 防止死循环
var REQUIRE_FRESH = process.env.FRESH !== 'false';

// ====== 模拟回答素材 ======
var TECH_ANSWERS = [
  '我使用了Spring Boot框架来构建微服务架构，通过@RestController定义API端点，利用@Autowired进行依赖注入。在电商系统中，我设计了订单服务的完整链路，包括订单创建、库存扣减和支付回调处理。',
  '关于Redis缓存策略，我采用了Cache-Aside模式。首先检查缓存是否存在，不存在则查询数据库并回写缓存。对于热点数据，我设置了永不过期+异步更新的策略来避免缓存击穿。',
  '在分布式事务处理上，我们使用了消息队列+RocketMQ的最终一致性方案。订单创建后发送半消息，等到库存扣减成功后再提交消息，如果失败则回滚订单状态。',
];

var BEHAVIORAL_ANSWERS = [
  '在上一个项目中，我遇到了跨团队协作的挑战。我们当时的订单模块需要和支付团队、物流团队紧密配合。我主动组织了周例会，建立了API文档共享机制，最终将联调时间从2周缩短到了3天。',
  '关于技术难点，我们曾经遇到数据库死锁问题。我通过分析慢查询日志，发现有多个事务以不同顺序访问相同表，于是统一了访问顺序并添加了乐观锁，彻底解决了这个问题。',
];

var QA_QUESTIONS = [
  '请问公司的技术栈是怎样的？主要用哪些框架？',
  '团队的开发流程是怎样的？如果我有技术方案想推动，一般走什么流程？',
];

var QA_END_ANSWER = '没有问题了，谢谢';

// ====== 工具 ======

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function fmt(val) {
  return val == null ? 'N/A' : typeof val === 'number' ? Math.round(val) + '' : val;
}

// ====== 步骤 1: 准备测试数据 ======

async function prepare(count) {
  var fs = require('fs');
  var path = require('path');

  console.log('\n准备 ' + count + ' 套测试数据...\n');

  // 1. 登录
  var loginRes = await fetch(BASE_URL + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  var admin = await loginRes.json();
  var auth = { Authorization: 'Bearer ' + admin.accessToken };
  console.log('1. 登录 OK');

  // 2. 创建共用职位
  var posRes = await fetch(BASE_URL + '/positions', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({
      title: '高级后端开发工程师',
      department: '技术平台部',
      jdText: '负责系统后端开发，要求熟悉Java/Spring Boot，有分布式系统经验，熟悉Redis、PostgreSQL、消息队列。参与过微服务架构设计，有容器化部署经验。',
      techStack: ['Java', 'Spring Boot', 'Redis', 'PostgreSQL', 'RabbitMQ', 'Docker'],
      level: '高级',
    }),
  });
  var position = await posRes.json();
  console.log('2. 职位创建 OK: ' + position.id);

  var ts = Date.now();
  var items = [];
  for (var i = 0; i < count; i++) {
    var email = 'fullflow_' + ts + '_' + i + '@test.com';
    var canRes = await fetch(BASE_URL + '/candidates', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({
        name: '全流程压测' + (i + 1),
        email: email,
        phone: '1390000' + String(i).padStart(4, '0'),
        positionId: position.id,
      }),
    });
    if (!canRes.ok) {
      console.log('\n  ❌ 候选人' + i + ' 创建失败 HTTP ' + canRes.status);
      continue;
    }
    var candidate = await canRes.json();

    var intRes = await fetch(BASE_URL + '/interviews', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({
        candidateId: candidate.id,
        positionId: position.id,
        interviewType: 'technical',
      }),
    });
    if (!intRes.ok) {
      console.log('\n  ❌ 面试' + i + ' 创建失败 HTTP ' + intRes.status);
      continue;
    }
    var interview = await intRes.json();

    items.push({
      candidateId: candidate.id,
      candidateName: candidate.name,
      interviewId: interview.id,
      accessToken: interview.accessToken,
      resumeText:
        '全流程压测' + (i + 1) + '，6年Java后端开发经验，\n' +
        '精通Spring Boot、MyBatis、Redis、RabbitMQ、Docker，\n' +
        '主导过电商核心交易链路设计，负责订单、支付、库存模块，\n' +
        '有微服务拆分经验，熟悉DDD领域驱动设计。',
    });

    process.stdout.write('\r  创建进度: ' + (i + 1) + '/' + count);
  }

  var dir = __dirname + '/results';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + '/full-flow-test-data.json', JSON.stringify(items, null, 2));

  console.log('\n\n✅ 数据准备完成，保存到 scripts/results/full-flow-test-data.json');
  console.log('   运行: node scripts/interview-full-flow-test.js run\n');
}

// ====== 步骤 2: 运行单个完整面试 ======

/**
 * 消费 SSE 流，收集所有事件，当流关闭时返回
 * 返回 { events, stageSequence, lastStage, done, error, messageCount }
 */
async function consumeSSE(response, timeoutMs) {
  var result = {
    events: [],
    stageSequence: [],
    lastStage: '',
    done: false,
    error: null,
    messageCount: 0,
    isInterrupt: false,  // true = 流自然关闭（中断等待用户输入）
  };

  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var timedOut = false;

  var timeout = setTimeout(function () {
    timedOut = true;
    try { reader.cancel(); } catch (e) {}
  }, timeoutMs || 120000);

  try {
    var done = false;
    while (!done) {
      var chunk;
      try { chunk = await reader.read(); }
      catch (e) { break; }
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data:')) continue;

        try {
          var data = JSON.parse(line.slice(5).trim());
          result.events.push(data);
          result.messageCount++;

          if (data.type === 'stage' && data.stage) {
            result.lastStage = data.stage;
            if (result.stageSequence[result.stageSequence.length - 1] !== data.stage) {
              result.stageSequence.push(data.stage);
            }
          }

          if (data.type === 'done') {
            result.done = true;
            done = true;
            break;
          }

          if (data.type === 'error') {
            result.error = data.message || 'Unknown error';
            result.done = true;
            done = true;
            break;
          }
        } catch (e) { /* 非 JSON 行忽略 */ }
      }
    }
  } finally {
    clearTimeout(timeout);
    // 如果流自然关闭且未收到 done/error → 说明是中断点
    if (!result.done && !result.error && !timedOut) {
      result.isInterrupt = true;
    }
    if (timedOut) {
      result.error = 'Timeout after ' + (timeoutMs || 120000) + 'ms';
    }
  }

  return result;
}

/**
 * 运行一个完整面试：start → 多轮 message → done
 */
async function runOneFullInterview(item, idx, results) {
  var t0 = Date.now();
  var turnTimings = [];
  var phaseTimings = {};
  var stageReached = [];
  var hitRag = false;
  var hitReport = false;
  var answerCount = 0;
  var qaCount = 0;

  try {
    // ====== 1. POST /start ======
    var startRes = await fetch(
      BASE_URL + '/interviews/' + item.interviewId + '/start?token=' + item.accessToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Interview-Token': item.accessToken,
        },
        body: JSON.stringify({ resumeText: item.resumeText }),
      },
    );

    if (!startRes.ok) {
      results.fail++;
      results.errors.push({ idx: idx, phase: 'start', error: 'HTTP ' + startRes.status });
      console.log('[FAIL] #' + idx + ' | start HTTP ' + startRes.status);
      return;
    }

    var sseResult = await consumeSSE(startRes, 120000);
    turnTimings.push({ phase: 'start+icebreaker', ms: Date.now() - t0 });

    if (sseResult.error) {
      results.fail++;
      results.errors.push({ idx: idx, phase: 'start SSE', error: sseResult.error });
      console.log('[FAIL] #' + idx + ' | start SSE: ' + sseResult.error);
      return;
    }

    stageReached = sseResult.stageSequence.slice();
    var currentStage = sseResult.lastStage;

    if (!sseResult.isInterrupt) {
      // 流关闭但没有中断也没有 done——异常情况
      if (!sseResult.done) {
        results.fail++;
        results.errors.push({ idx: idx, phase: 'start', error: 'SSE closed without interrupt or done' });
        console.log('[FAIL] #' + idx + ' | start SSE closed unexpectedly, stage=' + currentStage);
        return;
      }
    }

    // 记录各阶段到达时间
    if (stageReached.includes('icebreaker')) phaseTimings.icebreaker = Date.now() - t0;
    if (stageReached.includes('technical')) phaseTimings.technical = Date.now() - t0;
    if (stageReached.includes('behavioral')) phaseTimings.behavioral = Date.now() - t0;
    if (stageReached.includes('candidate_qa')) phaseTimings.candidate_qa = Date.now() - t0;

    // ====== 2. 循环发送回答，推进面试 ======
    var turnStart = Date.now();

    while (!sseResult.done && answerCount < MAX_TURNS) {
      // 选择答案
      var answer = '';
      if (currentStage === 'candidate_qa') {
        // 反问阶段：轮流向面试官提问（触发 RAG 知识库检索）
        if (qaCount < QA_QUESTIONS.length) {
          answer = QA_QUESTIONS[qaCount];
          qaCount++;
        } else {
          answer = QA_END_ANSWER; // 结束反问，触发 report
        }
      } else if (currentStage === 'behavioral') {
        answer = BEHAVIORAL_ANSWERS[answerCount % BEHAVIORAL_ANSWERS.length];
        answerCount++;
      } else {
        // icebreaker / technical
        answer = TECH_ANSWERS[answerCount % TECH_ANSWERS.length];
        answerCount++;
      }

      // POST /message
      var msgRes = await fetch(
        BASE_URL + '/interviews/' + item.interviewId + '/message?token=' + item.accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Interview-Token': item.accessToken,
          },
          body: JSON.stringify({ message: answer }),
        },
      );

      if (!msgRes.ok) {
        results.fail++;
        results.errors.push({ idx: idx, phase: 'message', error: 'HTTP ' + msgRes.status });
        console.log('[FAIL] #' + idx + ' | message HTTP ' + msgRes.status + ' at stage ' + currentStage);
        return;
      }

      var msgSSE = await consumeSSE(msgRes, 120000);
      var turnMs = Date.now() - turnStart;
      turnTimings.push({ phase: 'turn_' + answerCount + '(' + currentStage + ')', ms: turnMs });
      turnStart = Date.now();

      if (msgSSE.error) {
        results.fail++;
        results.errors.push({ idx: idx, phase: 'message SSE', error: msgSSE.error });
        console.log('[FAIL] #' + idx + ' | message SSE: ' + msgSSE.error);
        return;
      }

      // 合并阶段
      for (var s = 0; s < msgSSE.stageSequence.length; s++) {
        var stg = msgSSE.stageSequence[s];
        if (stageReached[stageReached.length - 1] !== stg) {
          stageReached.push(stg);
        }
      }
      currentStage = msgSSE.lastStage || currentStage;

      // 检查是否到达 RAG 阶段
      if (currentStage === 'candidate_qa' && !hitRag) {
        hitRag = true;
        phaseTimings.ragReached = Date.now() - t0;
      }

      // 记录各阶段时间
      if (stageReached.includes('behavioral') && !phaseTimings.behavioral) {
        phaseTimings.behavioral = Date.now() - t0;
      }
      if (stageReached.includes('candidate_qa') && !phaseTimings.candidate_qa) {
        phaseTimings.candidate_qa = Date.now() - t0;
      }

      sseResult = msgSSE;
    }

    // ====== 3. 汇总单个面试 ======
    var totalMs = Date.now() - t0;

    if (sseResult.done) {
      hitReport = true;
      results.success++;
    } else {
      results.partial++;
    }

    results.turnCounts.push(answerCount);
    results.totalMsList.push(totalMs);
    if (hitRag) results.ragReached++;
    if (hitReport) results.reportGenerated++;
    results.stagePaths.push(stageReached);

    var bar = sseResult.done ? '✅' : '⚠️ ';
    console.log(
      bar + ' #' + idx +
      ' | 轮次:' + answerCount +
      ' | 总耗时:' + fmt(totalMs) + 'ms' +
      ' | 阶段:' + stageReached.join('→') +
      ' | RAG:' + (hitRag ? '✓' : '✗') +
      ' | Report:' + (hitReport ? '✓' : '✗')
    );

  } catch (e) {
    results.fail++;
    results.errors.push({ idx: idx, phase: 'exception', error: e.message });
    console.log('[FAIL] #' + idx + ' | ' + e.message);
  }
}

// ====== 步骤 3: 运行 ======

async function run() {
  var fs = require('fs');
  var filePath = __dirname + '/results/full-flow-test-data.json';

  if (!fs.existsSync(filePath)) {
    console.error('未找到测试数据，请先运行: node scripts/interview-full-flow-test.js prepare 5');
    process.exit(1);
  }

  var allItems = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  var items = allItems.slice(0, CONCURRENT);
  var mode = LLM_REAL ? '🔥 真实 LLM' : '🧪 Mock LLM';

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  面试全流程压测（含 RAG + Report）           ║');
  console.log('║  模式: ' + mode + '                              ║');
  console.log('║  并发: ' + String(CONCURRENT).padStart(3) + '                                ║');
  console.log('║  最大轮次: ' + String(MAX_TURNS).padStart(3) + '                            ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  var results = {
    success: 0,
    partial: 0,
    fail: 0,
    turnCounts: [],
    totalMsList: [],
    ragReached: 0,
    reportGenerated: 0,
    stagePaths: [],
    errors: [],
  };

  var startTime = Date.now();

  // 并发执行
  var promises = items.map(function (item, idx) {
    return runOneFullInterview(item, idx, results);
  });

  await Promise.all(promises);

  // ====== 汇总 ======
  var elapsed = (Date.now() - startTime) / 1000;

  function percentile(arr, p) {
    if (arr.length === 0) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var idx = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[Math.max(0, idx)];
  }

  function avg(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  }

  var totalCompleted = results.success + results.partial;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         全流程压测汇总                       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  模式:           ' + (mode + '                          ').slice(0, 26) + '║');
  console.log('║  并发:           ' + (String(CONCURRENT) + '                             ').slice(0, 26) + '║');
  console.log('║  ────────────────────────────────────────    ║');
  console.log('║  完成/部分/失败: ' + (results.success + ' / ' + results.partial + ' / ' + results.fail + '                       ').slice(0, 26) + '║');
  console.log('║  总耗时:         ' + (elapsed.toFixed(1) + 's                            ').slice(0, 26) + '║');
  console.log('║  ────────────────────────────────────────    ║');
  console.log('║  —— 轮次分布 ——                             ║');
  console.log('║  avg: ' + fmt(avg(results.turnCounts)).padStart(5) + '  min: ' + fmt(results.turnCounts.length ? Math.min.apply(null, results.turnCounts) : 0).padStart(3) + '  max: ' + fmt(results.turnCounts.length ? Math.max.apply(null, results.turnCounts) : 0).padStart(3) + '                       ║');
  console.log('║  —— 全流程耗时（start → done）——              ║');
  console.log('║  avg: ' + fmt(avg(results.totalMsList)).padStart(5) + 'ms  P50: ' + fmt(percentile(results.totalMsList, 50)).padStart(5) + 'ms  P95: ' + fmt(percentile(results.totalMsList, 95)).padStart(5) + 'ms ║');
  console.log('║  —— 关键节点覆盖率 ——                        ║');
  console.log('║  RAG 反问到达:   ' + (String(results.ragReached) + '/' + String(totalCompleted)).padStart(7) + '                         ║');
  console.log('║  报告生成:       ' + (String(results.reportGenerated) + '/' + String(totalCompleted)).padStart(7) + '                         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  吞吐量: ' + String((totalCompleted / elapsed).toFixed(1)).padStart(6) + ' 面试/秒                    ║');
  console.log('╚══════════════════════════════════════════════╝');

  // 打印每条路径
  if (results.stagePaths.length > 0) {
    console.log('\n阶段路径:');
    results.stagePaths.forEach(function (path, i) {
      console.log('  #' + i + ': ' + path.join(' → '));
    });
  }

  if (results.errors.length > 0) {
    console.log('\n错误详情:');
    results.errors.forEach(function (e) {
      console.log('  [' + e.idx + '][' + e.phase + '] ' + e.error);
    });
  }
}

// ====== 入口 ======
var cmd = process.argv[2];
var count = parseInt(process.argv[3], 10) || CONCURRENT;

(async function () {
  if (cmd === 'prepare') {
    await prepare(count);
  } else if (cmd === 'run') {
    if (REQUIRE_FRESH) {
      console.log('(自动准备 ' + count + ' 套新数据...)');
      await prepare(count);
    }
    await run();
  } else {
    console.log('面试全流程压测 — 自动 prepare + run\n');
    await prepare(count);
    await run();
  }
})();
