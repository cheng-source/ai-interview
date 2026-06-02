import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { createLLM, createEmbeddings, setCallType } from "../llm";
import { candidateQaPersona } from "../personas/candidate-qa.persona";

async function vectorSearchKnowledge(query: string): Promise<string> {
  if (!query.trim()) return "";
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const embeddings = createEmbeddings();
    const [queryVector] = await embeddings.embedDocuments([query]);

    const results = await prisma.$queryRawUnsafe<
      Array<{ content: string; similarity: number }>
    >(
      `SELECT c.content, 1 - (c.embedding <=> $1::vector) AS similarity
       FROM "CompanyDocChunk" c
       WHERE c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT 3`,
      `[${queryVector.join(",")}]`,
    );
    await prisma.$disconnect();

    const relevant = results.filter((r) => r.similarity >= 0.3);
    return relevant.map((r) => r.content).join("\n---\n") || "";
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

  // 向量语义检索，比 ILIKE 关键词匹配质量更高
  const knowledge = candidateQuestion
    ? await vectorSearchKnowledge(candidateQuestion)
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
