import assert from "node:assert/strict";
import { z } from "zod";
import { parseStructuredResponseWithLocalRepair } from "../src/langgraph/personas/structured-output";

async function main() {
  const schema = z.object({
    score: z.number(),
    summary: z.string(),
  });

  assert.deepEqual(
    parseStructuredResponseWithLocalRepair(
      "```json\n{score: 88, summary: '回答扎实',}\n```",
      schema,
    ),
    {
      score: 88,
      summary: "回答扎实",
    },
  );

  assert.throws(
    () =>
      parseStructuredResponseWithLocalRepair(
        "{score: '八十八', summary: '回答扎实'}",
        schema,
      ),
    /schema_parse/,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
