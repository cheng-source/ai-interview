import assert from "node:assert/strict";
import { createStreamingContext } from "../src/langgraph/llm";
import {
  clearActiveInterviewStream,
  getActiveInterviewStream,
  registerActiveInterviewStream,
} from "../src/interview/interview-sse";

const stream = createStreamingContext();

registerActiveInterviewStream("interview-1", stream);
assert.equal(getActiveInterviewStream("interview-1"), stream);

clearActiveInterviewStream("interview-1", stream);
assert.equal(getActiveInterviewStream("interview-1"), null);

registerActiveInterviewStream("interview-2", stream);
clearActiveInterviewStream("interview-2", createStreamingContext());
assert.equal(getActiveInterviewStream("interview-2"), stream);

clearActiveInterviewStream("interview-2", stream);
