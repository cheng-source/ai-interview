import assert from "node:assert/strict";
import { isTerminalInterviewState } from "../src/interview/interview-sse";

async function main() {
  assert.equal(
    isTerminalInterviewState({
      currentStage: "technical",
      techRound: { currentQuestion: { text: "请说明 SSE 重连设计" } },
    }),
    false,
  );

  assert.equal(isTerminalInterviewState({ currentStage: "done" }), true);
  assert.equal(isTerminalInterviewState({ reportText: "最终报告" }), true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
