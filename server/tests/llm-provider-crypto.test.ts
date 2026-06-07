import assert from "node:assert/strict";
import { LlmProviderCrypto } from "../src/llm-provider/llm-provider.crypto";

async function main() {
  const crypto = new LlmProviderCrypto("unit-test-secret");
  const encrypted = crypto.encrypt("sk-real-secret");

  assert.notEqual(encrypted.ciphertext, "sk-real-secret");
  assert.ok(encrypted.nonce.length > 0);
  assert.equal(crypto.decrypt(encrypted), "sk-real-secret");
  assert.equal(crypto.mask("sk-real-secret"), "sk-***ret");
  assert.equal(crypto.mask("short"), "***");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
