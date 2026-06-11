// =============================================================================
// 面试流程压测脚本
//
// 面试流程: icebreaker(模板) → 中断 → 候选人回答 → parse_resume(LLM) → tech_select(LLM)
//          → tech_evaluate(LLM) → 中断 → 候选人回答 → ...
//
// POST /start → SSE 流推到第一个中断点就关闭
// POST /message → 新的 SSE 流推到下一个中断点
//
// 本脚本目前测第一段: 多个候选人同时 POST /start，观察 icebreaker 吞吐量
// 这是最关键的压测点——LangGraph 初始化 + SSE 建连 + Redis/DB 写入
//
// 两档:
//   Mock 模式（LLM_MOCK=true）: 测系统基础设施，可高并发
//   真实模式（LLM_MOCK=false）: 测 LLM API 延迟，低并发
//
// 用法:
//   node scripts/interview-load-test.js          # 自动 prepare + run
//   node scripts/interview-load-test.js prepare 10
//   CONCURRENT=20 node scripts/interview-load-test.js run
// =============================================================================

var BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
var CONCURRENT = parseInt(process.env.CONCURRENT || '10', 10);
var LLM_REAL = process.env.LLM_REAL === 'true';
var REQUIRE_FRESH = process.env.FRESH !== 'false'; // 默认每次 run 前重新 prepare

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
      title: '压测岗位',
      department: '压测部门',
      jdText: '负责系统后端开发，要求熟悉Java/Spring Boot，有分布式系统经验',
      techStack: ['Java', 'Spring Boot', 'Redis', 'PostgreSQL'],
      level: '高级',
    }),
  });
  var position = await posRes.json();
  console.log('2. 职位创建 OK: ' + position.id);

  var ts = Date.now();
  var items = [];
  for (var i = 0; i < count; i++) {
    // 3. 创建候选人（邮箱加时间戳防重复）
    var email = 'lt' + ts + '_' + i + '@test.com';
    var canRes = await fetch(BASE_URL + '/candidates', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({
        name: '压测候选人' + (i + 1),
        email: email,
        phone: '1380000' + String(i).padStart(4, '0'),
        positionId: position.id,
      }),
    });
    if (!canRes.ok) {
      console.log('\n  ❌ 候选人' + i + ' 创建失败 HTTP ' + canRes.status);
      continue;
    }
    var candidate = await canRes.json();

    // 4. 创建面试
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
        '压测候选人' + (i + 1) + '，' + (5 + (i % 10)) + '年Java开发经验，\n' +
        '熟悉Spring Boot、MyBatis、Redis、RabbitMQ，\n' +
        '参与过电商系统架构设计，负责订单模块开发，\n' +
        '有微服务拆分和容器化部署经验。',
    });

    process.stdout.write('\r  创建进度: ' + (i + 1) + '/' + count);
  }

  // 保存到文件
  var dir = __dirname + '/results';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + '/test-data.json', JSON.stringify(items, null, 2));

  console.log('\n\n✅ 数据准备完成，保存到 scripts/results/test-data.json');
  console.log('   运行: node scripts/interview-load-test.js run\n');
}

// ====== 步骤 2: 并发启动面试 ======

async function run() {
  var fs = require('fs');
  var filePath = __dirname + '/results/test-data.json';

  if (!fs.existsSync(filePath)) {
    console.error('未找到测试数据，请先运行: node scripts/interview-load-test.js prepare 10');
    process.exit(1);
  }

  var allItems = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  var items = allItems.slice(0, CONCURRENT);
  var mode = LLM_REAL ? '🔥 真实 LLM' : '🧪 Mock LLM';

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  面试流程并发压测                          ║');
  console.log('║  模式: ' + mode + '                              ║');
  console.log('║  并发: ' + String(CONCURRENT).padStart(3) + '                                ║');
  console.log('╚══════════════════════════════════════════╝\n');

  var results = {
    success: 0,
    fail: 0,
    firstTokenMs: [],    // 首 token 延迟（流式响应速度）
    icebreakerMs: [],    // 破冰完成耗时（icebreaker 节点）
    questionMs: [],      // 第一道题出完耗时（tech_select 节点）
    totalMs: [],         // 整体完成耗时
    messagesPer: [],     // 每个面试收到的 SSE 消息数
    errors: [],
  };

  var startTime = Date.now();

  // 并发启动
  var promises = items.map(function (item, idx) {
    return startOneInterview(item, idx, results);
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

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║           压测汇总                       ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  模式:       ' + (mode + '                          ').slice(0, 26) + '║');
  console.log('║  并发:       ' + (String(CONCURRENT) + '                              ').slice(0, 26) + '║');
  console.log('║  成功/失败:  ' + (results.success + ' / ' + results.fail + '                          ').slice(0, 26) + '║');
  console.log('║  总耗时:     ' + (elapsed.toFixed(1) + 's                           ').slice(0, 26) + '║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  —— 首包延迟（第一个 SSE 事件到达）——     ║');
  console.log('║  avg: ' + fmt(avg(results.firstTokenMs)).padStart(5) + 'ms  P50: ' + fmt(percentile(results.firstTokenMs, 50)).padStart(5) + 'ms  P95: ' + fmt(percentile(results.firstTokenMs, 95)).padStart(5) + 'ms ║');
  console.log('║  —— 破冰耗时（请求 → icebreaker 中断）——  ║');
  console.log('║  avg: ' + fmt(avg(results.icebreakerMs)).padStart(5) + 'ms  P50: ' + fmt(percentile(results.icebreakerMs, 50)).padStart(5) + 'ms  P95: ' + fmt(percentile(results.icebreakerMs, 95)).padStart(5) + 'ms ║');
  console.log('║  —— 整体耗时（→ SSE 流关闭）——             ║');
  console.log('║  avg: ' + fmt(avg(results.totalMs)).padStart(5) + 'ms  P50: ' + fmt(percentile(results.totalMs, 50)).padStart(5) + 'ms  P95: ' + fmt(percentile(results.totalMs, 95)).padStart(5) + 'ms ║');
  console.log('╚══════════════════════════════════════════╝');

  if (results.errors.length > 0) {
    console.log('\n错误详情:');
    results.errors.forEach(function (e) {
      console.log('  [' + e.idx + '] ' + e.error);
    });
  }
}

// 启动一个面试并观察 SSE 流
async function startOneInterview(item, idx, results) {
  var t0 = Date.now();
  var firstTokenRecorded = false;
  var icebreakerDone = false;
  var questionReceived = false;

  try {
    // ---- 启动面试（POST /start 的响应就是 SSE 流）----
    // 前端的做法: fetch POST /start → readSSE(response)
    // 响应头是 text/event-stream，body 是 SSE 格式
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
      results.errors.push({ idx: idx, error: '启动失败 HTTP ' + startRes.status });
      console.log('[FAIL] 面试' + idx + ' | 启动 HTTP ' + startRes.status);
      return;
    }

    var reader = startRes.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var msgCount = 0;

    // 最多等 90 秒（真实 LLM 可能慢）
    var timeout = setTimeout(function () {
      reader.cancel();
    }, 90000);

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
        msgCount++;

        try {
          var data = JSON.parse(line.slice(5).trim());

          // 首 token 或首 message → 记录流式响应首字节时间
          if (!firstTokenRecorded && (data.type === 'token' || data.type === 'message')) {
            results.firstTokenMs.push(Date.now() - t0);
            firstTokenRecorded = true;
          }

          // stage === 'icebreaker' → 第一个中断点，面试流程第一段完成
          if (!icebreakerDone && data.type === 'stage' && data.stage === 'icebreaker') {
            results.icebreakerMs.push(Date.now() - t0);
            icebreakerDone = true;
            questionReceived = true; // icebreaker 中断 = 第一段成功
          }

          // 后续阶段（tech_select / behavioral_select 等）
          if (data.type === 'stage' && data.stage !== 'icebreaker') {
            results.questionMs.push(Date.now() - t0);
          }

          // 面试完成或出错
          if (data.type === 'done') {
            results.success++;
            results.totalMs.push(Date.now() - t0);
            results.messagesPer.push(msgCount);
            reader.cancel();
            done = true;
            break;
          }
          if (data.type === 'error') {
            results.fail++;
            results.errors.push({ idx: idx, error: data.message || data.content });
            results.totalMs.push(Date.now() - t0);
            results.messagesPer.push(msgCount);
            reader.cancel();
            done = true;
            break;
          }
        } catch (e) { /* 非 JSON 行忽略 */ }
      }
    }

    clearTimeout(timeout);

    // 到达 icebreaker 中断点 → 算成功
    if (icebreakerDone && !results.totalMs.includes(Date.now() - t0)) {
      results.totalMs.push(Date.now() - t0);
      results.messagesPer.push(msgCount);
      results.success++;
    }

    // 无任何进展
    if (!icebreakerDone && !firstTokenRecorded) {
      results.fail++;
      results.errors.push({ idx: idx, error: '未收到任何 SSE 事件' });
    }

    var status = icebreakerDone ? 'OK' : 'PARTIAL';
    var ftDisplay = firstTokenRecorded ? fmt(results.firstTokenMs[results.firstTokenMs.length - 1]) + 'ms' : '无';
    console.log(
      '[' + status + '] #' + idx +
      ' | 首包:' + ftDisplay +
      ' | 破冰:' + fmt(Date.now() - t0) + 'ms' +
      ' | 消息:' + msgCount
    );

  } catch (e) {
    results.fail++;
    results.errors.push({ idx: idx, error: e.message });
    console.log('[FAIL] 面试' + idx + ' | ' + e.message);
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
    // 默认: 自动 prepare + run
    console.log('面试流程压测 — 自动 prepare + run\n');
    await prepare(count);
    await run();
  }
})();
