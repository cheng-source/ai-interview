// =============================================================================
// k6 REST API 压测脚本 — AI 面试系统
//
// 测试目标:
//   - 所有 REST 接口在高并发下的响应时间
//   - 系统在阶梯加压过程中的稳定性（预热→峰值→冷却）
//   - 错误率是否在可接受范围内
//
// 用法:
//   k6 run scripts/k6-load-test.js                          # 默认阶梯加压
//   k6 run --vus 20 --duration 60s scripts/k6-load-test.js   # 固定并发
//   k6 run --vus 100 --duration 5m scripts/k6-load-test.js   # 极限压测
//
// 环境变量:
//   BASE_URL       - 后端地址，默认 http://localhost:3000/api
//   ADMIN_USERNAME - 管理员用户名，默认 admin
//   ADMIN_PASSWORD - 管理员密码，默认 123456
// =============================================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// =============================================================================
// 自定义指标
// k6 内置指标: http_req_duration, http_req_failed, http_reqs, vus 等
// 这里额外定义业务粒度的指标，方便在 handleSummary 中汇总
// =============================================================================

// 自定义趋势指标: 记录每次请求的 P95/P99 响应时间
// Trend 类型自动计算 min/max/avg/p(50)/p(90)/p(95)/p(99)
const p95 = new Trend('p95_response_time', true);
const p99 = new Trend('p99_response_time', true);

// 计数器: 错误数 / 总数 = 错误率
const errorRate = new Rate('error_rate');

// 计数器: 总请求数（k6 内置的 http_reqs 也统计，但这个更灵活）
const totalRequests = new Counter('total_requests');

// =============================================================================
// 可配置参数
// 通过环境变量注入，不硬编码，方便 CI/CD 集成
// =============================================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const ADMIN_USERNAME = __ENV.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || '123456';

// =============================================================================
// 压测策略: 阶梯式加压 (Ramp-up → Steady → Ramp-down)
//
// 设计思路:
//   预热期 30s 爬到 10 VU —— 让系统预热（JIT 编译、连接池建立）
//   加压期 60s 爬到 50 VU —— 观察响应时间是否线性增长
//   峰值期 60s 维持100 VU —— 找到系统的性能拐点
//   收压期 30s 降到 50 VU —— 观察恢复能力
//   冷却期 30s 降到  0 VU —— 优雅结束
//
// 如果只做快速冒烟测试，用命令行覆盖: --vus 20 --duration 60s
// =============================================================================
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // 阶段 1: 预热 — 10 VU 让连接池/缓存热身
    { duration: '1m',  target: 50 },   // 阶段 2: 加压 — 模拟正常业务高峰
    { duration: '1m',  target: 100 },  // 阶段 3: 峰值 — 找到响应时间拐点
    { duration: '30s', target: 50 },   // 阶段 4: 收压 — 观察系统恢复速度
    { duration: '30s', target: 0 },    // 阶段 5: 冷却 — 留下报告时间
  ],
  // 阈值：超过则标记测试失败（不影响测试继续执行）
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // P95 响应时间必须 < 2 秒
    'http_req_failed':    ['rate<0.05'], // 错误率必须 < 5%
  },
};

// =============================================================================
// 全局状态: 跨 VU 共享（通过 setup 返回的 data 传递）
// =============================================================================
let adminToken = '';       // 管理员 JWT，setup 阶段通过登录获取
let testInterviewId = '';  // 测试用的面试 ID，从已有数据中取第一条
let testToken = '';        // 面试访问 token，用于候选人接口

// =============================================================================
// setup(): 所有 VU 启动前只执行一次
// 负责: 登录拿 token、找测试数据
// 返回值会传给每个 VU 的 default 函数作为 data 参数
// =============================================================================
export function setup() {
  // ---- 步骤 1: 管理员登录 ----
  // 这是压测脚本的关键：先拿到 token，后续所有需要鉴权的接口都带这个 token
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, {
    '登录成功': (r) => r.status === 200 || r.status === 201,
  });
  const token = loginRes.json()?.accessToken || '';

  // ---- 步骤 2: 找可用的面试 ID 用于候选人端接口压测 ----
  if (token) {
    // 拉面试列表，取第一条（需要系统中有已创建的面试）
    const interviewsRes = http.get(`${BASE_URL}/interviews`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = interviewsRes.json() || [];

    if (list.length > 0) {
      testInterviewId = list[0].id;

      // 获取面试的 access token（用于候选人端鉴权）
      const accessTokenRes = http.get(
        `${BASE_URL}/interviews/${testInterviewId}/access-token`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      try {
        const body = accessTokenRes.json();
        testToken = body?.accessToken || '';
      } catch {
        // 如果接口不支持或返回非 JSON，忽略
      }
    }
  }

  console.log(
    `[Setup] 登录: ${token ? '✅' : '❌'} | 测试面试: ${testInterviewId || '无(候选人接口将被跳过)'}`,
  );
  return { token };
}

// =============================================================================
// default(): 每个 VU 的主循环，不断执行直到测试结束
//
// 场景权重设计（通过 sleep 时间控制相对频率）:
//   管理员后台查询  — 3 个 group × 0.5s = 1.5s → 约 40%
//   LLM Provider    — 2 个 group × 0.5s = 1.0s → 约 20%
//   候选人端查询    — 1 个 group × 1.0s = 1.0s → 约 30%
//   知识库搜索      — 1 个 group × 0.5s = 0.5s → 约 10%
//
// 所有 group 都用 GET 读接口 —— 压测以读为主，不污染生产数据
// =============================================================================
export default function (data) {
  adminToken = data.token;

  // =======================================================================
  // 场景组 1: 管理员后台 — 模拟 HR 日常操作（权重 ~40%）
  // 这三个接口是后台 Dashboard 的核心数据源，调用频率最高
  // =======================================================================

  group('Admin - 职位列表', () => {
    // GET /api/positions — 查询所有职位
    // 预期行为: 有 token 返回 200，无 token 返回 401
    const res = http.get(`${BASE_URL}/positions`, authHeaders());
    trackResponse(res);
    sleep(0.5); // 模拟用户浏览间隔
  });

  group('Admin - 候选人列表', () => {
    // GET /api/candidates — 查询所有候选人
    // 这个接口可能关联 Position 表做 JOIN，注意数据库查询性能
    const res = http.get(`${BASE_URL}/candidates`, authHeaders());
    trackResponse(res);
    sleep(0.5);
  });

  group('Admin - 报告列表', () => {
    // GET /api/reports — 查询所有面试报告
    // 报告数据可能较大（包含 JSON 评估结果），注意响应体大小
    const res = http.get(`${BASE_URL}/reports`, authHeaders());
    trackResponse(res);
    sleep(0.5);
  });

  // =======================================================================
  // 场景组 2: LLM Provider 管理 — 查询 AI 服务配置（权重 ~20%）
  // 这些接口通常很轻量（查 Prisma 几条记录），适合做高频压测
  // =======================================================================

  group('Admin - LLM Provider 列表', () => {
    // GET /api/llm-providers — 查询所有 LLM 提供商配置
    const res = http.get(`${BASE_URL}/llm-providers`, authHeaders());
    trackResponse(res);
    sleep(0.5);
  });

  group('Admin - LLM Provider 默认配置', () => {
    // GET /api/llm-providers/default — 查询默认提供商
    const res = http.get(`${BASE_URL}/llm-providers/default`, authHeaders());
    trackResponse(res);
    sleep(0.5);
  });

  // =======================================================================
  // 场景组 3: 候选人端 — 面试状态查询（权重 ~30%）
  // 这是面试过程中调用最频繁的接口（轮询状态 / 断线恢复）
  // =======================================================================

  if (testInterviewId) {
    group('Candidate - 面试状态查询', () => {
      // GET /api/interviews/:id/state?token=xxx
      // URL 参数传 token 是候选人端的鉴权方式（不同于管理员的 Bearer token）
      const url = testToken
        ? `${BASE_URL}/interviews/${testInterviewId}/state?token=${testToken}`
        : `${BASE_URL}/interviews/${testInterviewId}/state`;
      const res = http.get(url);

      // 只有 token 正确时才期望 200；无 token 时 401 也是正常行为
      if (testToken) {
        check(res, { 'state 返回 200': (r) => r.status === 200 });
      }
      trackResponse(res);
      sleep(1); // 候选人端查询间隔稍长
    });
  }

  // =======================================================================
  // 场景组 4: 知识库搜索 — 模拟知识库查询（权重 ~10%）
  // 这个接口涉及 pgvector 向量搜索，是潜在的性能瓶颈
  // =======================================================================

  group('Knowledge - 搜索', () => {
    // GET /api/knowledge/search?q=xxx
    // 注意: 搜索是读操作但需要数据库做向量距离计算，可能比普通查询慢
    const res = http.get(`${BASE_URL}/knowledge/search?q=Java`, authHeaders());
    trackResponse(res);
    sleep(0.5);
  });
}

// =============================================================================
// 工具函数
// =============================================================================

// 构造带 Bearer token 的请求头
// 如果 token 还没拿到（setup 失败），返回空对象，接口会返回 401
function authHeaders() {
  return adminToken
    ? { headers: { Authorization: `Bearer ${adminToken}` } }
    : {};
}

// 统一记录每次请求的指标
// - 总请求数 +1
// - HTTP 错误（4xx/5xx）→ 错误率 +1
// - 记录响应时间到 P95/P99 趋势指标
function trackResponse(res) {
  totalRequests.add(1);

  // 4xx/5xx 都算错误（401 在候选人端场景中可能是预期的，但不影响整体统计）
  if (res.status >= 400) {
    errorRate.add(1);
  }

  // timings.duration 是请求的端到端时间（ms），包含 DNS/TCP/TLS/TTFB 等
  const duration = res.timings.duration;
  if (duration > 0) {
    p95.add(duration);
    p99.add(duration);
  }
}

// =============================================================================
// handleSummary(): 测试结束后的汇总报告
//
// k6 在测试结束时调用此函数，传入完整的指标数据
// 返回一个对象: key 是输出目标（'stdout' 或文件路径），value 是内容
// 这里只输出到 stdout，也可以用 'result.json' 存文件
// =============================================================================
export function handleSummary(data) {
  // 提取关键指标，做一层扁平化方便阅读
  const summary = {
    // ----- 总体统计 -----
    total_requests: data.metrics.total_requests?.values?.count || 0,
    total_vus_max: data.metrics.vus_max?.values?.max || 0,
    error_rate: (data.metrics.error_rate?.values?.rate || 0).toFixed(3),

    // ----- 响应时间（ms）-----
    http_req_duration: {
      avg: fmt(data.metrics.http_req_duration?.values?.avg),
      p50: fmt(data.metrics.http_req_duration?.values?.['p(50)']),
      p95: fmt(data.metrics.http_req_duration?.values?.['p(95)']),
      p99: fmt(data.metrics.http_req_duration?.values?.['p(99)']),
      max: fmt(data.metrics.http_req_duration?.values?.max),
    },

    // ----- 各接口的详细统计 -----
    // k6 会自动按 URL + method 分组统计 http_req_duration
    // 通过 data.metrics.http_req_duration?.values 可以拿到每个分组的 P95
  };

  return {
    // 输出到终端
    stdout: JSON.stringify(summary, null, 2),
    // 同时存一份 JSON 文件，方便归档对比
    'results/summary.json': JSON.stringify(data, null, 2),
  };
}

// 辅助: 毫秒转可读字符串
function fmt(v) {
  if (v == null) return 'N/A';
  return Math.round(v) + 'ms';
}
