import assert from "node:assert/strict";
import { formatElapsed } from "./format.ts";

assert.equal(formatElapsed(0), "00:00");
assert.equal(formatElapsed(9), "00:09");
assert.equal(formatElapsed(65), "01:05");
assert.equal(formatElapsed(3601), "60:01");
assert.equal(formatElapsed(-4), "00:00");
