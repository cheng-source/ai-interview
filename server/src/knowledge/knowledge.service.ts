import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { createEmbeddings } from "../langgraph/llm";

const CHUNK_TARGET = 800; // 目标 chunk 大小
const CHUNK_MAX = 1200; // 超大的 chunk 需要拆分
const SENTENCE_RE = /(?<=[。！？；\n])/;

/** 语义分块：尊重文档结构，避免硬切 */
function semanticChunk(text: string): string[] {
  const lines = text.split("\n");

  // 第一步：按 Markdown 标题切分段落块
  const paragraphs: string[] = [];
  let buf = "";
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && buf.trim()) {
      paragraphs.push(buf.trim());
      buf = "";
    }
    buf += line + "\n";
  }
  if (buf.trim()) paragraphs.push(buf.trim());

  // 如果没有标题，回退到双换行切分
  const sections =
    paragraphs.length > 1
      ? paragraphs
      : text
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);

  // 第二步：合并过小的相邻段落
  const merged: string[] = [];
  let pending = "";
  for (const section of sections) {
    if (!pending) {
      pending = section;
    } else if ((pending + "\n\n" + section).length <= CHUNK_TARGET) {
      pending += "\n\n" + section;
    } else {
      merged.push(pending);
      pending = section;
    }
  }
  if (pending) merged.push(pending);

  // 第三步：拆分超大段落（按句子边界）
  const chunks: string[] = [];
  for (const section of merged) {
    if (section.length <= CHUNK_MAX) {
      chunks.push(section);
    } else {
      const sentences = section.split(SENTENCE_RE).filter(Boolean);
      let current = "";
      for (const sentence of sentences) {
        if ((current + sentence).length > CHUNK_TARGET && current) {
          chunks.push(current.trim());
          // overlap：保留最后一句作为下一个 chunk 的开头
          current = current.split(SENTENCE_RE).slice(-1).join("") + sentence;
        } else {
          current += sentence;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }

  return chunks;
}

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.companyDoc.findMany({ orderBy: { uploadedAt: "desc" } });
  }

  async upload(title: string, content: string, category: string) {
    const doc = await this.prisma.companyDoc.create({
      data: { title, content, category },
    });

    // 向量化：语义分块 + 生成 embedding + 写入 CompanyDocChunk
    try {
      const chunks = semanticChunk(content);
      const embeddings = createEmbeddings();
      const vectors = await embeddings.embedDocuments(chunks);
      console.log("🚀 ~ KnowledgeService ~ upload ~ vectors:", vectors);

      // Unsupported("vector") 类型无法通过 Prisma typed API 写入，用 transaction 批量 raw SQL
      await this.prisma.$transaction(
        chunks.map((chunk, i) =>
          this.prisma.$executeRawUnsafe(
            `INSERT INTO "CompanyDocChunk" ("id", "docId", "title", "category", "content", "chunkIndex", "embedding")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::vector)`,
            doc.id,
            title,
            category,
            chunk,
            i,
            `[${vectors[i].join(",")}]`,
          ),
        ),
      );
    } catch (e) {
      // embedding 失败不阻塞上传，日志记录即可
      console.error("文档向量化失败:", e);
    }

    return doc;
  }

  async remove(id: string) {
    return this.prisma.companyDoc.delete({ where: { id } }); // chunks 级联删除
  }

  /** 解析上传文件（PDF/DOCX/DOC/TXT/MD） */
  async extractFileText(file: Express.Multer.File): Promise<string> {
    const mimetype = file.mimetype;
    const ext = file.originalname?.split(".").pop()?.toLowerCase();

    if (mimetype === "application/pdf" || ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(file.buffer);
      return data.text || "";
    }
    if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value || "";
    }
    if (mimetype === "application/msword" || ext === "doc") {
      const { default: WordExtractor } = await import("word-extractor");
      const extractor = new WordExtractor();
      const doc = await extractor.extract(file.buffer);
      return doc.getBody() || "";
    }
    // txt / md / 其他文本类型
    return file.buffer.toString("utf-8");
  }

  /** 上传文件：解析文本 → 分块 → embedding → 入库 */
  async uploadFile(title: string, category: string, file: Express.Multer.File) {
    const content = await this.extractFileText(file);
    return this.upload(title, content, category);
  }

  /** 管理后台关键词搜索（不涉及向量） */
  async search(query: string) {
    return this.prisma.companyDoc.findMany({
      where: {
        OR: [{ title: { contains: query } }, { content: { contains: query } }],
      },
      take: 5,
    });
  }

  /** 向量语义检索，用于 candidate-qa 节点 */
  async vectorSearch(
    query: string,
    topK = 3,
    minSimilarity = 0.3,
    category?: string,
  ) {
    const embeddings = createEmbeddings();
    const [queryVector] = await embeddings.embedDocuments([query]);

    let sql = `SELECT c.content, c.title, 1 - (c.embedding <=> $1::vector) AS similarity, c."docId"
       FROM "CompanyDocChunk" c
       WHERE c.embedding IS NOT NULL`;
    const params: any[] = [`[${queryVector.join(",")}]`];

    // 按 category 过滤：先尝试精确匹配，无结果则回退全量
    if (category) {
      sql += ` AND c.category = $2`;
      params.push(category);
    }

    sql += ` ORDER BY c.embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(topK);

    const results = await this.prisma.$queryRawUnsafe<
      Array<{
        content: string;
        title: string;
        similarity: number;
        docId: string;
      }>
    >(sql, ...params);

    // 如果按 category 过滤后无结果，回退到不带 category 的全量检索
    if (!results.length && category) {
      const fallbackSql = `SELECT c.content, c.title, 1 - (c.embedding <=> $1::vector) AS similarity, c."docId"
        FROM "CompanyDocChunk" c
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2`;
      const fallback = await this.prisma.$queryRawUnsafe<
        Array<{
          content: string;
          title: string;
          similarity: number;
          docId: string;
        }>
      >(fallbackSql, `[${queryVector.join(",")}]`, topK);
      return fallback
        .filter((r) => r.similarity >= minSimilarity)
        .map((r) => `[来源: ${r.title}]\n${r.content}`)
        .join("\n\n---\n\n");
    }

    return results
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => `[来源: ${r.title}]\n${r.content}`)
      .join("\n\n---\n\n");
  }
}
