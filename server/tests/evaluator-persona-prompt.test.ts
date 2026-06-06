import assert from "node:assert/strict";
import { techEvaluatorPersona } from "../src/langgraph/personas/tech-evaluator.persona";
import { behavioralEvaluatorPersona } from "../src/langgraph/personas/behavioral-evaluator.persona";

function includesAll(prompt: string, phrases: string[]) {
  for (const phrase of phrases) {
    assert.ok(prompt.includes(phrase), `Expected prompt to include: ${phrase}`);
  }
}

async function main() {
  includesAll(techEvaluatorPersona.systemPrompt, [
    "评分维度",
    "score 评分标准",
    "工程判断",
    "isSurfaceLevel",
    "只有概念名词、没有解释为什么和怎么做时，score 不得高于 5",
    "没有体现真实项目细节或工程权衡时，score 通常不得高于 6",
  ]);

  includesAll(behavioralEvaluatorPersona.systemPrompt, [
    "评分维度",
    "score 评分标准",
    "个人行动",
    "isVague",
    "没有具体案例时，score 不得高于 4",
    "只有团队成果、没有个人行动时，score 不得高于 5",
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
