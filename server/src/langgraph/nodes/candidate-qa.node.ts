import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import {
  createLLM,
  createEmbeddings,
  setCallType,
  rerank,
  pushEvent,
} from "../llm";
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
      `你是一个检索查询改写助手。你的任务是把用户原始问题改写成更适合知识库检索的单句查询。

要求：
1. 保留用户核心意图，不引入原问题没有的事实
2. 对过短、过泛的问题补充必要语义，使其更可检索
3. 输出必须是单行纯文本，不要 Markdown，不要解释
4. 如果原问题已经足够具体，原样输出
5. 如果存在对话历史，结合上下文理解用户的追问意图
`,
    ),
    new HumanMessage(question),
  ]);
  console.log("🚀 ~ rewriteQuery ~ res:", res);
  const text = typeof res.content === "string" ? res.content : "";
  return text.trim() || question;
}

async function vectorSearchKnowledge(
  query: string,
  category?: string,
): Promise<string> {
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
    console.log("🚀 ~ vectorSearchKnowledge ~ results:", results);

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
  const candidateQuestion = state.candidateAnswer || "";
  const qaCount = state.qaCount || 0;

  // 首次进入反问环节（刚从技术/行为面切换过来）：发送提示，等待候选人提问
  if (!candidateQuestion.trim()) {
    const prompt =
      qaCount === 0
        ? "面试环节已结束，现在是反问环节。你对公司有什么想了解的吗？可以问我关于技术栈、团队架构、企业文化、福利制度、职业发展等方面的问题。"
        : "还有其他想了解的吗？";
    pushEvent({ type: "message", content: prompt, stage: "candidate_qa" });
    pushEvent({ type: "stage", stage: "candidate_qa" });
    interrupt({ type: "waiting_for_question" });
    return { messages: [new AIMessage(prompt)], currentStage: "candidate_qa" };
  }

  setCallType("text");
  const llm = createLLM({
    temperature: candidateQaPersona.temperature,
    streaming: candidateQaPersona.streaming,
  });

  // 向量语义检索，优先按岗位部门过滤知识库
  const category = state.position?.department || undefined;
  pushEvent({ type: "status", content: "正在检索知识库..." });
  const knowledge = candidateQuestion
    ? await vectorSearchKnowledge(candidateQuestion, category)
    : "";
  console.log("Candidate QA - Retrieved Knowledge:", knowledge);
  const systemPrompt = knowledge
    ? `${candidateQaPersona.systemPrompt}\n\n以下是从公司知识库检索到的相关信息，请据此回答：\n${knowledge}\n\n这是第${qaCount}个问题，最多回答5个问题。`
    : `${candidateQaPersona.systemPrompt}\n这是第${qaCount}个问题，最多回答5个问题。`;

  pushEvent({ type: "status", content: "正在生成回答..." });
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
