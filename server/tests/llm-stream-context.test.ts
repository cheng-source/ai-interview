import assert from "node:assert/strict";
import {
  createStreamingContext,
  pushEvent,
  runWithStreamingContext,
} from "../src/langgraph/llm";

async function collect(stream: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

async function main() {
  const streamA = createStreamingContext();
  const streamB = createStreamingContext();

  const collectA = collect(streamA);
  const collectB = collect(streamB);

  const taskA = runWithStreamingContext(streamA, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    pushEvent({ type: "token", content: "A" });
    streamA.done();
  });

  const taskB = runWithStreamingContext(streamB, async () => {
    pushEvent({ type: "token", content: "B" });
    await new Promise((resolve) => setTimeout(resolve, 1));
    streamB.done();
  });

  await Promise.all([taskA, taskB]);

  assert.deepEqual(await collectA, [{ type: "token", content: "A" }]);
  assert.deepEqual(await collectB, [{ type: "token", content: "B" }]);

  const replayed = createStreamingContext();
  replayed.push({ type: "token", content: "before-subscribe" });
  replayed.done();

  assert.deepEqual(await collect(replayed), [
    { type: "token", content: "before-subscribe" },
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
