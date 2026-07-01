import assert from "node:assert/strict";
import { buildConceptQuestionContext } from "../src/langgraph/nodes/technical-interview.node";

async function main() {
  const context = buildConceptQuestionContext(
    {
      candidate: { skills: [] },
      position: { techStack: ["Vue 3", "NestJS", "SSE"] },
      techRound: { topics: [] },
      answerHistory: [
        {
          question: {
            topic: "LangGraph 中断恢复机制中的状态一致性保障",
          },
        },
      ],
    },
    0,
  );

  assert.equal(context.usingFallbackSkills, true);
  assert.equal(context.conceptTopic, "Vue 3");
  assert.deepEqual(context.skillsForPrompt[0], {
    category: "Vue 3",
    items: ["Vue 3", "NestJS", "SSE"],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
