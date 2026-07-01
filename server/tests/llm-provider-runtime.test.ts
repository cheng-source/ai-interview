import assert from "node:assert/strict";
import {
  clearRuntimeProviderSnapshotForTest,
  getEnabledChatProviderIds,
  resolveChatProviderConfig,
  setRuntimeProviderSnapshot,
} from "../src/langgraph/llm";

async function main() {
  const originalModel = process.env.LLM_MODEL;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;

  process.env.LLM_MODEL = "env-model";
  process.env.OPENAI_API_KEY = "env-key";
  process.env.OPENAI_BASE_URL = "https://env.example/v1";
  clearRuntimeProviderSnapshotForTest();

  assert.deepEqual(resolveChatProviderConfig(), {
    model: "env-model",
    apiKey: "env-key",
    baseURL: "https://env.example/v1",
    protocol: "openai-compatible",
    capabilities: null,
    temperature: undefined,
  });

  setRuntimeProviderSnapshot({
    defaultChatProviderId: "deepseek",
    defaultEmbeddingProviderId: "dashscope",
    providers: [
      {
        id: "deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "db-key",
        model: "deepseek-v4-pro",
        temperature: 0.2,
        enabled: true,
      },
      {
        id: "disabled",
        baseUrl: "https://disabled.example/v1",
        apiKey: "disabled-key",
        model: "disabled-model",
        enabled: false,
      },
      {
        id: "dashscope-embedding",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "embedding-key",
        model: "text-embedding-v3",
        embeddingModel: "text-embedding-v3",
        supportsEmbedding: true,
        enabled: true,
      },
    ],
  });

  assert.deepEqual(getEnabledChatProviderIds(), ["deepseek"]);

  assert.equal(resolveChatProviderConfig().baseURL, "https://api.deepseek.com/v1");

  assert.deepEqual(resolveChatProviderConfig(), {
    model: "deepseek-v4-pro",
    apiKey: "db-key",
    baseURL: "https://api.deepseek.com/v1",
    protocol: "openai-compatible",
    capabilities: undefined,
    temperature: 0.2,
  });

  assert.deepEqual(resolveChatProviderConfig("missing"), {
    model: "deepseek-v4-pro",
    apiKey: "db-key",
    baseURL: "https://api.deepseek.com/v1",
    protocol: "openai-compatible",
    capabilities: undefined,
    temperature: 0.2,
  });

  assert.throws(() => resolveChatProviderConfig("disabled"), /disabled/);

  clearRuntimeProviderSnapshotForTest();
  process.env.LLM_MODEL = originalModel;
  process.env.OPENAI_API_KEY = originalApiKey;
  process.env.OPENAI_BASE_URL = originalBaseUrl;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
