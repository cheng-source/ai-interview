// Node.js API 压测脚本 — 替代 k6
// 用法: node scripts/node-load-test.js
// 环境变量: BASE_URL, STAGES_VUS, STAGES_DURATION

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const CONCURRENT = parseInt(process.env.STAGES_VUS || '20', 10);
const DURATION = parseInt(process.env.STAGES_DURATION || '30', 10);

var endpoints = [
  ['职位列表', '/positions'],
  ['候选人列表', '/candidates'],
  ['报告列表', '/reports'],
  ['LLM Provider', '/llm-providers'],
  ['知识库搜索', '/knowledge/search?q=Java'],
];

var stats = {
  total: 0, ok: 0, fail: 0,
  durations: [],
  startTime: 0,
};

var token = '';

// 登录
async function setup() {
  try {
    var res = await fetch(BASE_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });
    if (res.ok) {
      var data = await res.json();
      token = data.accessToken || '';
      console.log('[Setup] 登录 ' + (token ? 'OK' : 'FAIL'));
    } else {
      console.log('[Setup] 登录 HTTP ' + res.status);
    }
  } catch (e) {
    console.log('[Setup] 登录失败: ' + e.message);
  }
}

// 单次请求
async function oneHit() {
  var pair = endpoints[Math.floor(Math.random() * endpoints.length)];
  var name = pair[0];
  var path = pair[1];

  var t0 = performance.now();
  try {
    var headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    var res = await fetch(BASE_URL + path, { headers: headers });
    var ms = performance.now() - t0;
    stats.total++;
    stats.durations.push(ms);
    if (res.status < 400) stats.ok++;
    else stats.fail++;
  } catch (e) {
    stats.total++;
    stats.fail++;
    stats.durations.push(performance.now() - t0);
  }
}

// 一个 VU 持续发请求
async function vuLoop(id) {
  var end = Date.now() + DURATION * 1000;
  while (Date.now() < end) {
    await oneHit();
    // 随机间隔 100-500ms，避免请求太密集
    await sleep(100 + Math.random() * 400);
  }
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  var sorted = arr.slice().sort(function (a, b) { return a - b; });
  var idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function fmt(val) {
  if (val == null) return '0';
  return typeof val === 'number' ? Math.round(val) : val;
}

// 主程序
async function main() {
  console.log('');
  console.log('==========================================');
  console.log('  Node.js API 压测');
  console.log('  目标: ' + BASE_URL);
  console.log('  并发: ' + CONCURRENT + ' VU × ' + DURATION + 's');
  console.log('  接口: ' + endpoints.map(function (e) { return e[0]; }).join(', '));
  console.log('==========================================');
  console.log('');

  await setup();

  stats.startTime = Date.now();

  // 每秒报告
  var reportTimer = setInterval(function () {
    var elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    var p95 = fmt(percentile(stats.durations, 95));
    var p99 = fmt(percentile(stats.durations, 99));
    var avg = stats.durations.length > 0
      ? Math.round(stats.durations.reduce(function (a, b) { return a + b; }, 0) / stats.durations.length)
      : 0;
    process.stdout.write(
      '\r  [' + ('   ' + elapsed).slice(-3) + 's] ' +
      '请求:' + ('      ' + stats.total).slice(-6) + '  ' +
      'OK:' + ('     ' + stats.ok).slice(-5) + '  ' +
      'FAIL:' + ('    ' + stats.fail).slice(-4) + '  ' +
      'avg:' + ('    ' + avg).slice(-4) + 'ms  ' +
      'p95:' + ('    ' + p95).slice(-4) + 'ms  ' +
      'p99:' + ('    ' + p99).slice(-4) + 'ms'
    );
  }, 500);

  // 启动 N 个并发 VU
  var vus = [];
  for (var i = 0; i < CONCURRENT; i++) {
    vus.push(vuLoop(i));
  }
  await Promise.all(vus);

  clearInterval(reportTimer);

  // 汇总
  var elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  var durations = stats.durations.slice().sort(function (a, b) { return a - b; });
  var totalMs = stats.durations.reduce(function (a, b) { return a + b; }, 0);

  console.log('');
  console.log('');
  console.log('=============== ' + elapsed + 's 汇总 ===============');
  console.log('总请求:   ' + stats.total);
  console.log('成功:     ' + stats.ok);
  console.log('失败:     ' + stats.fail);
  console.log('错误率:   ' + (stats.fail / stats.total * 100).toFixed(1) + '%');
  console.log('吞吐量:   ' + (stats.total / Number(elapsed)).toFixed(1) + ' req/s');
  console.log('avg:      ' + Math.round(totalMs / stats.durations.length) + 'ms');
  console.log('p50:      ' + fmt(percentile(durations, 50)) + 'ms');
  console.log('p95:      ' + fmt(percentile(durations, 95)) + 'ms');
  console.log('p99:      ' + fmt(percentile(durations, 99)) + 'ms');
  console.log('max:      ' + fmt(durations[durations.length - 1]) + 'ms');
  console.log('==================================================');
}

main().catch(function (e) { console.error(e); process.exit(1); });
