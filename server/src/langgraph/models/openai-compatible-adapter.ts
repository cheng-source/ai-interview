import { SystemMessage } from "@langchain/core/messages";
import { createLLM, pushEvent, resolveChatProviderConfig } from "../llm";
import { ANTI_INJECTION_INSTRUCTION } from "../prompt-security";
import { invokeWithRetry } from "../personas/llm-retry";
import { emitPersonaWarning } from "../personas/persona-warning";
import {
  extractRawContent,
  parseStructuredResponseWithLocalRepair,
  repairStructuredJson,
  zodToJsonTemplate,
} from "../personas/structured-output";
import type {
  ModelAdapter,
  PersonaModelInvokeInput,
  StructuredModelInvokeInput,
} from "./model-types";

export class OpenAICompatibleAdapter implements ModelAdapter {
  private getProviderContext(providerId: string | undefined) {
    const provider = resolveChatProviderConfig(providerId);
    return {
      providerId: providerId || "default",
      model: provider.model,
      baseURL: provider.baseURL,
      protocol: provider.protocol,
    };
  }

  async invokeStructured(input: StructuredModelInvokeInput) {
    const { persona, userMessage, options, providerId, schema } = input;
    const providerContext = this.getProviderContext(providerId);
    const llm = createLLM({
      providerId,
      temperature: persona.temperature,
      streaming: false,
    });
    // 直接走 JSON Prompt 路径，不使用 withStructuredOutput。
    // 原因：DeepSeek thinking 模式不支持 tool_choice（LangChain withStructuredOutput 默认依赖），
    // 先试框架结构化输出再降级会浪费一次往返并产生噪音 warning，故直接用基于 prompt 的 JSON 提取。
    const jsonTemplate = zodToJsonTemplate(schema);
    const jsonPrompt = `${persona.systemPrompt}

${ANTI_INJECTION_INSTRUCTION}

只输出纯 JSON，不要用 markdown 代码块包裹。格式如下：
${jsonTemplate}`;
    const messages = [new SystemMessage(jsonPrompt), userMessage];
    const response = await invokeWithRetry(persona, options, () =>
      llm.invoke(messages),
    );
    const rawContent = extractRawContent(response);
    try {
      return {
        response: parseStructuredResponseWithLocalRepair(rawContent, schema),
        content: "",
      };
    } catch (parseError: any) {
      console.warn("[LLM] local JSON repair failed", {
        personaId: persona.id,
        personaName: persona.name,
        outputMode: persona.outputMode,
        contentType: Array.isArray(response?.content)
          ? "array"
          : typeof response?.content,
        rawContentPreview:
          typeof rawContent === "string"
            ? rawContent.slice(0, 500)
            : String(rawContent),
        parseError: String(parseError?.message || parseError),
        ...providerContext,
      });
      emitPersonaWarning(
        persona,
        "LLM_JSON_REPAIR",
        `本地 JSON 修复失败: ${providerContext.providerId}/${providerContext.model}，正在尝试模型修复 JSON`,
        options,
        undefined,
        {
          ...providerContext,
          outputMode: persona.outputMode,
        },
      );
      try {
        const repaired = await repairStructuredJson(
          llm,
          rawContent,
          schema,
          jsonTemplate,
        );
        return { response: repaired, content: "" };
      } catch (error) {
        throw error;
      }
    }
  }

  async invokeText(input: PersonaModelInvokeInput) {
    const { persona, userMessage, options, providerId, streaming } = input;
    const llm = createLLM({
      providerId,
      temperature: persona.temperature,
      streaming,
    });
    const messages = [
      new SystemMessage(
        `${persona.systemPrompt}

${ANTI_INJECTION_INSTRUCTION}`,
      ),
      userMessage,
    ];
    const response = await invokeWithRetry(persona, options, () =>
      llm.invoke(messages),
    );
    const content =
      typeof response.content === "string" ? response.content : "";

    if (!options?.silent) {
      if (streaming) {
        pushEvent({ type: "token_end" });
      } else if (persona.outputMode === "text" && content) {
        pushEvent({ type: "token", content });
        pushEvent({ type: "token_end" });
      }
    }

    return { response, content };
  }
}
