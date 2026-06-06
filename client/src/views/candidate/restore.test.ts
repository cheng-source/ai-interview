import assert from "node:assert/strict";
import { buildRestoredInterview } from "./restore.ts";

const now = new Date("2026-06-06T10:00:00Z").getTime();

{
  const restored = buildRestoredInterview({
    state: {
      currentStage: "technical",
      answerHistory: [
        {
          stage: "icebreaker",
          question: { text: "Please introduce yourself.", topic: "intro" },
        },
        {
          stage: "icebreaker",
          answer: "I am the candidate.",
        },
      ],
      techRound: {
        currentQuestion: {
          text: "**Technical question**\nExplain the refresh recovery design.\n[time] 240",
          topic: "recovery",
          type: "technical",
          difficulty: 3,
          timeLimit: 240,
        },
      },
    },
    interviewId: "interview-1",
    startedAt: "2026-06-06T09:55:00Z",
    now,
  });

  assert.equal(restored.started, true);
  assert.equal(restored.currentStage, "technical");
  assert.equal(restored.totalElapsed, 300);
  assert.equal(restored.questionSeconds, 240);
  assert.deepEqual(
    restored.messages.map((m) => [m.role, m.content]),
    [
      ["interviewer", "Please introduce yourself."],
      ["candidate", "I am the candidate."],
      ["interviewer", "**Technical question**\nExplain the refresh recovery design.\n[time] 240"],
    ],
  );
}

{
  const restored = buildRestoredInterview({
    state: {
      currentStage: "technical",
      answerHistory: [
        {
          stage: "technical",
          question: { text: "What is Vue?", topic: "Vue" },
          answer: "A frontend framework.",
          evaluation: { score: 8, summary: "Solid answer." },
        },
      ],
    },
    interviewId: "interview-score",
    now,
  });

  assert.deepEqual(
    restored.messages.map((m) => m.role),
    ["interviewer", "candidate"],
  );
  assert.equal(
    restored.messages.some((m) => /score|评估|evaluation/i.test(m.content)),
    false,
  );
  assert.equal(
    restored.stageLog.some((entry) => /score|评估|evaluation/i.test(entry.label)),
    false,
  );
  assert.equal(restored.evaluations.length, 1);
  assert.equal(restored.evaluations[0].score, 8);
}

{
  const restored = buildRestoredInterview({
    state: {
      currentStage: "technical",
      candidateAnswer: "My submitted answer.",
      answerHistory: [],
      techRound: {
        currentQuestion: {
          text: "This should come from the live replay stream.",
          topic: "recovery",
          type: "technical",
          difficulty: 3,
          timeLimit: 240,
        },
      },
    },
    interviewId: "interview-active",
    hasActiveStream: true,
    now,
  });

  assert.deepEqual(
    restored.messages.map((m) => [m.role, m.content]),
    [["candidate", "My submitted answer."]],
  );
}

{
  const restored = buildRestoredInterview({
    state: {
      currentStage: "candidate_qa",
      answerHistory: [],
      qaCount: 0,
    },
    interviewId: "interview-2",
    now,
  });

  assert.equal(restored.started, true);
  assert.equal(restored.currentStage, "candidate_qa");
  assert.equal(restored.messages.at(-1)?.role, "interviewer");
  assert.match(restored.messages.at(-1)?.content || "", /candidate Q&A section/);
}

{
  const restored = buildRestoredInterview({
    state: null,
    interviewId: "interview-3",
    now,
  });

  assert.equal(restored.started, false);
  assert.equal(restored.messages.length, 0);
}
