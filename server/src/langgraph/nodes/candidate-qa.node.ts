import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { createLLM, createEmbeddings, setCallType, rerank } from "../llm";
import { candidateQaPersona } from "../personas/candidate-qa.persona";
import { PrismaClient } from "@prisma/client";

let cachedPrisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!cachedPrisma) {
    cachedPrisma = new PrismaClient();
  }
  return cachedPrisma;
}

async function rewriteQuery(question: string): Promise<string> {
  const rewriteLLM = createLLM({ temperature: 0, streaming: false });
  const res = await rewriteLLM.invoke([
    new SystemMessage(
      `将以下候选人提问改写为更适合语义检索的关键词短语。
要求：
- 提取核心概念，去除口语化表达和无关修饰
- 输出 2-5 个关键词或短语，用空格分隔
- 只输出改写结果，不要解释`,
    ),
    new HumanMessage(question),
  ]);
  const text = typeof res.content === "string" ? res.content : "";
  return text.trim() || question;
}

async function vectorSearchKnowledge(query: string, category?: string): Promise<string> {
  if (!query.trim()) return "";
  try {
    const searchQuery = await rewriteQuery(query);

    const prisma = getPrisma();
    const embeddings = createEmbeddings();
    const [queryVector] = await embeddings.embedDocuments([searchQuery]);

    // 向量检索取 top-10，扩大召回范围
    const results = await prisma.$queryRawUnsafe<
      Array<{ content: string; similarity: number; title: string }>
    >(
      `SELECT c.content, c.title, 1 - (c.embedding <=> $1::vector) AS similarity
       FROM "CompanyDocChunk" c
       WHERE c.embedding IS NOT NULL
         ${category ? "AND c.category = $2" : ""}
       ORDER BY c.embedding <=> $1::vector
       LIMIT 10`,
      `[${queryVector.join(",")}]`,
      ...(category ? [category] : []),
    );

    const candidates = results.filter((r) => r.similarity >= 0.3);

    if (!candidates.length) {
      if (category) return vectorSearchKnowledge(query);
      return "";
    }

    // Rerank 精排，取 top-3，保留来源标题
    const reranked = await rerank(
      query,
      candidates.map((r) => r.content),
      3,
    );
    const titleMap = new Map(candidates.map((r) => [r.content, r.title]));
    return reranked
      .map((r) => `[来源: ${titleMap.get(r.content) || "未知"}]\n${r.content}`)
      .join("\n\n---\n\n");
  } catch {
    return "";
  }
}

export async function candidateQaNode(state: any): Promise<any> {
  setCallType("text");
  const llm = createLLM({
    temperature: candidateQaPersona.temperature,
    streaming: candidateQaPersona.streaming,
  });

  const candidateQuestion = state.candidateAnswer || "";
  const qaCount = state.qaCount || 0;

  // 向量语义检索，优先按岗位部门过滤知识库
  const category = state.position?.department || undefined;
  const knowledge = candidateQuestion
    ? await vectorSearchKnowledge(candidateQuestion, category)
    : "";
  console.log("Candidate QA - Retrieved Knowledge:", knowledge);
  const systemPrompt = knowledge
    ? `${candidateQaPersona.systemPrompt}\n\n以下是从公司知识库检索到的相关信息，请据此回答：\n${knowledge}\n\n这是第${qaCount}个问题，最多回答5个问题。`
    : `${candidateQaPersona.systemPrompt}\n这是第${qaCount}个问题，最多回答5个问题。`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(candidateQuestion || "你好，我想了解一下..."),
  ]);

  const content = typeof response.content === "string" ? response.content : "";

  return {
    messages: [new AIMessage(content)],
    qaCount: qaCount + 1,
    candidateAnswer: "",
  };
}
