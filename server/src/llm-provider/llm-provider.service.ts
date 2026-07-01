import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  clearRuntimeProviderSnapshot,
  setRuntimeProviderSnapshot,
  type RuntimeProviderConfig,
} from "../langgraph/llm";
import { LlmProviderCrypto } from "./llm-provider.crypto";
import type { DefaultProviderDto, ProviderDto, UpsertProviderDto } from "./dto";

const GLOBAL_SETTING_ID = 1;

@Injectable()
export class LlmProviderService implements OnModuleInit {
  private readonly crypto = new LlmProviderCrypto();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedFromEnvironment();
    await this.reloadRuntimeSnapshot();
  }

  async list(): Promise<ProviderDto[]> {
    const [providers, setting] = await Promise.all([
      this.prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } }),
      this.getSetting(),
    ]);

    return providers.map((provider) => ({
      id: provider.id,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      maskedApiKey: this.crypto.mask(this.crypto.decrypt({
        nonce: provider.apiKeyNonce,
        ciphertext: provider.apiKeyCiphertext,
      })),
      model: provider.model,
      capabilities: this.normalizeCapabilities(provider.capabilities),
      embeddingModel: provider.embeddingModel,
      embeddingDimensions: provider.embeddingDimensions,
      supportsEmbedding: provider.supportsEmbedding,
      temperature: provider.temperature,
      enabled: provider.enabled,
      builtin: provider.builtin,
      defaultChatProvider: provider.id === setting?.defaultChatProviderId,
      defaultEmbeddingProvider: provider.id === setting?.defaultEmbeddingProviderId,
    }));
  }

  async create(data: UpsertProviderDto) {
    const id = this.requireText(data.id, "id");
    const apiKey = this.requireText(data.apiKey, "apiKey");
    const encrypted = this.crypto.encrypt(apiKey);

    await this.prisma.llmProvider.create({
      data: {
        id,
        protocol: this.normalizeProtocol(data.protocol),
        baseUrl: this.requireText(data.baseUrl, "baseUrl"),
        apiKeyNonce: encrypted.nonce,
        apiKeyCiphertext: encrypted.ciphertext,
        model: this.requireText(data.model, "model"),
        capabilities: this.normalizeCapabilities(data.capabilities),
        embeddingModel: this.optionalText(data.embeddingModel),
        embeddingDimensions: data.embeddingDimensions ?? null,
        supportsEmbedding: data.supportsEmbedding ?? !!this.optionalText(data.embeddingModel),
        temperature: data.temperature ?? null,
        enabled: data.enabled ?? true,
        builtin: false,
      },
    });
    await this.ensureSetting(id);
    await this.reloadRuntimeSnapshot();
  }

  async update(id: string, data: UpsertProviderDto) {
    const existing = await this.prisma.llmProvider.findUnique({ where: { id } });
    if (!existing) throw new Error(`Provider ${id} not found`);

    const encrypted = data.apiKey?.trim() ? this.crypto.encrypt(data.apiKey.trim()) : null;
    await this.prisma.llmProvider.update({
      where: { id },
      data: {
        ...(data.protocol !== undefined ? { protocol: this.normalizeProtocol(data.protocol) } : {}),
        ...(data.baseUrl !== undefined ? { baseUrl: this.requireText(data.baseUrl, "baseUrl") } : {}),
        ...(data.model !== undefined ? { model: this.requireText(data.model, "model") } : {}),
        ...(data.capabilities !== undefined ? { capabilities: this.normalizeCapabilities(data.capabilities) } : {}),
        ...(data.embeddingModel !== undefined ? { embeddingModel: this.optionalText(data.embeddingModel) } : {}),
        ...(data.embeddingDimensions !== undefined ? { embeddingDimensions: data.embeddingDimensions } : {}),
        ...(data.supportsEmbedding !== undefined ? { supportsEmbedding: data.supportsEmbedding } : {}),
        ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(encrypted ? { apiKeyNonce: encrypted.nonce, apiKeyCiphertext: encrypted.ciphertext } : {}),
      },
    });
    await this.reloadRuntimeSnapshot();
  }

  async remove(id: string) {
    const setting = await this.getSetting();
    if (setting?.defaultChatProviderId === id || setting?.defaultEmbeddingProviderId === id) {
      throw new Error("Cannot delete default provider");
    }
    await this.prisma.llmProvider.delete({ where: { id } });
    await this.reloadRuntimeSnapshot();
  }

  async getDefault(): Promise<DefaultProviderDto> {
    const setting = await this.getSetting();
    return {
      defaultProvider: setting?.defaultChatProviderId,
      defaultEmbeddingProvider: setting?.defaultEmbeddingProviderId,
    };
  }

  async updateDefault(data: DefaultProviderDto) {
    const providerId = this.requireText(data.defaultProvider, "defaultProvider");
    await this.requireProvider(providerId);
    await this.prisma.llmGlobalSetting.upsert({
      where: { id: GLOBAL_SETTING_ID },
      create: {
        id: GLOBAL_SETTING_ID,
        defaultChatProviderId: providerId,
        defaultEmbeddingProviderId: data.defaultEmbeddingProvider || providerId,
      },
      update: { defaultChatProviderId: providerId },
    });
    await this.reloadRuntimeSnapshot();
  }

  async updateDefaultEmbedding(data: DefaultProviderDto) {
    const providerId = this.requireText(data.defaultEmbeddingProvider, "defaultEmbeddingProvider");
    const provider = await this.requireProvider(providerId);
    if (!provider.supportsEmbedding || !provider.embeddingModel) {
      throw new Error(`Provider ${providerId} does not support embeddings`);
    }
    await this.prisma.llmGlobalSetting.upsert({
      where: { id: GLOBAL_SETTING_ID },
      create: {
        id: GLOBAL_SETTING_ID,
        defaultChatProviderId: providerId,
        defaultEmbeddingProviderId: providerId,
      },
      update: { defaultEmbeddingProviderId: providerId },
    });
    await this.reloadRuntimeSnapshot();
  }

  async testProvider(id: string) {
    const provider = await this.requireProvider(id);
    const apiKey = this.crypto.decrypt({
      nonce: provider.apiKeyNonce,
      ciphertext: provider.apiKeyCiphertext,
    });
    const url = this.chatCompletionsUrl(provider.baseUrl);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: "Reply with OK only." }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { success: false, message: `HTTP ${response.status}: ${(await response.text()).slice(0, 160)}` };
      }
      return { success: true, message: "连接成功", model: provider.model };
    } catch (error: any) {
      return { success: false, message: `连接失败: ${error?.message || String(error)}`, model: provider.model };
    }
  }

  async reloadRuntimeSnapshot() {
    const [providers, setting] = await Promise.all([
      this.prisma.llmProvider.findMany({ where: { enabled: true } }),
      this.getSetting(),
    ]);

    if (!providers.length || !setting) {
      clearRuntimeProviderSnapshot();
      return;
    }

    setRuntimeProviderSnapshot({
      defaultChatProviderId: setting.defaultChatProviderId,
      defaultEmbeddingProviderId: setting.defaultEmbeddingProviderId || setting.defaultChatProviderId,
      providers: providers.map((provider): RuntimeProviderConfig => ({
        id: provider.id,
        protocol: this.normalizeProtocol(provider.protocol),
        baseUrl: provider.baseUrl,
        apiKey: this.crypto.decrypt({
          nonce: provider.apiKeyNonce,
          ciphertext: provider.apiKeyCiphertext,
        }),
        model: provider.model,
        capabilities: this.normalizeCapabilities(provider.capabilities),
        embeddingModel: provider.embeddingModel,
        embeddingDimensions: provider.embeddingDimensions,
        supportsEmbedding: provider.supportsEmbedding,
        temperature: provider.temperature,
        enabled: provider.enabled,
      })),
    });
  }

  private async seedFromEnvironment() {
    if (await this.prisma.llmProvider.count()) return;
    const id = process.env.LLM_PROVIDER_ID || "deepseek";
    const encrypted = this.crypto.encrypt(process.env.OPENAI_API_KEY || "");
    await this.prisma.llmProvider.create({
      data: {
        id,
        protocol: "openai-compatible",
        baseUrl: process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1",
        apiKeyNonce: encrypted.nonce,
        apiKeyCiphertext: encrypted.ciphertext,
        model: process.env.LLM_MODEL || "deepseek-v4-pro",
        capabilities: this.defaultChatCapabilities(),
        temperature: this.optionalNumber(process.env.LLM_TEMPERATURE),
        supportsEmbedding: false,
        builtin: true,
        enabled: true,
      },
    });
    let defaultEmbeddingProviderId = id;
    if (process.env.EMBEDDING_API_KEY && process.env.EMBEDDING_MODEL) {
      const embeddingId = process.env.EMBEDDING_PROVIDER_ID || "dashscope-embedding";
      const embeddingEncrypted = this.crypto.encrypt(process.env.EMBEDDING_API_KEY);
      await this.prisma.llmProvider.create({
        data: {
          id: embeddingId,
          protocol: "openai-compatible",
          baseUrl: process.env.EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
          apiKeyNonce: embeddingEncrypted.nonce,
          apiKeyCiphertext: embeddingEncrypted.ciphertext,
          model: process.env.EMBEDDING_MODEL,
          capabilities: this.defaultChatCapabilities(),
          embeddingModel: process.env.EMBEDDING_MODEL,
          embeddingDimensions: this.optionalNumber(process.env.EMBEDDING_DIMENSIONS),
          supportsEmbedding: true,
          builtin: true,
          enabled: true,
        },
      });
      defaultEmbeddingProviderId = embeddingId;
    }
    await this.ensureSetting(id, defaultEmbeddingProviderId);
  }

  private async ensureSetting(defaultProviderId: string, defaultEmbeddingProviderId = defaultProviderId) {
    const existing = await this.getSetting();
    if (existing) return existing;
    return this.prisma.llmGlobalSetting.create({
      data: {
        id: GLOBAL_SETTING_ID,
        defaultChatProviderId: defaultProviderId,
        defaultEmbeddingProviderId,
      },
    });
  }

  private getSetting() {
    return this.prisma.llmGlobalSetting.findUnique({ where: { id: GLOBAL_SETTING_ID } });
  }

  private async requireProvider(id: string) {
    const provider = await this.prisma.llmProvider.findUnique({ where: { id } });
    if (!provider) throw new Error(`Provider ${id} not found`);
    return provider;
  }

  private requireText(value: unknown, field: string): string {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
    return value.trim();
  }

  private optionalText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private optionalNumber(value: unknown): number | null {
    if (typeof value !== "string" || !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeProtocol(value: unknown): "openai-compatible" {
    if (value === undefined || value === null || value === "") {
      return "openai-compatible";
    }
    if (value === "openai-compatible") {
      return "openai-compatible";
    }
    throw new Error(`Unsupported provider protocol: ${String(value)}`);
  }

  private normalizeCapabilities(value: unknown): Record<string, boolean> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const capabilities: Record<string, boolean> = {};
    for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
      if (typeof enabled === "boolean") capabilities[key] = enabled;
    }
    return Object.keys(capabilities).length ? capabilities : null;
  }

  private defaultChatCapabilities(): Record<string, boolean> {
    return {
      streaming: true,
      jsonMode: false,
      jsonSchema: false,
      toolCalling: false,
    };
  }

  private chatCompletionsUrl(baseUrl: string): string {
    const normalized = baseUrl.replace(/\/+$/, "");
    return normalized.endsWith("/v1")
      ? `${normalized}/chat/completions`
      : `${normalized}/v1/chat/completions`;
  }
}
