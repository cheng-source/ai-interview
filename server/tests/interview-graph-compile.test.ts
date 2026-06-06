import assert from "node:assert/strict";
import { createInterviewGraph } from "../src/langgraph/interview.graph";

const graph = createInterviewGraph();

assert.doesNotThrow(() => graph.compile());
