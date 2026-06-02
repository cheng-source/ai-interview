import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createEmbeddings } from '../langgraph/llm';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.companyDoc.findMany({ orderBy: { uploadedAt: 'desc' } });
  }

  async upload(title: string, content: string, category: string) {
    const doc = await this.prisma.companyDoc.create({
      data: { title, content, category },
    });

    // 向量化：分块 + 生成 embedding + 写入 CompanyDocChunk
    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });
      const docs = await splitter.createDocuments([content]);
      const embeddings = createEmbeddings();
      const vectors = await embeddings.embedDocuments(docs.map((d) => d.pageContent));

      // Unsupported("vector") 类型无法通过 Prisma typed API 写入，用 transaction 批量 raw SQL
      await this.prisma.$transaction(
        docs.map((chunk, i) =>
          this.prisma.$executeRawUnsafe(
            `INSERT INTO "CompanyDocChunk" ("id", "docId", "content", "chunkIndex", "embedding")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4::vector)`,
            doc.id,
            chunk.pageContent,
            i,
            `[${vectors[i].join(',')}]`,
          ),
        ),
      );
    } catch (e) {
      // embedding 失败不阻塞上传，日志记录即可
      console.error('文档向量化失败:', e);
    }

    return doc;
  }

  async remove(id: string) {
    return this.prisma.companyDoc.delete({ where: { id } }); // chunks 级联删除
  }

  /** 管理后台关键词搜索（不涉及向量） */
  async search(query: string) {
    return this.prisma.companyDoc.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { content: { contains: query } },
        ],
      },
      take: 5,
    });
  }

  /** 向量语义检索，用于 candidate-qa 节点 */
  async vectorSearch(query: string, topK = 3, minSimilarity = 0.3) {
    const embeddings = createEmbeddings();
    const [queryVector] = await embeddings.embedDocuments([query]);

    const results = await this.prisma.$queryRawUnsafe<
      Array<{ content: string; similarity: number; docId: string }>
    >(
      `SELECT c.content, 1 - (c.embedding <=> $1::vector) AS similarity, c."docId"
       FROM "CompanyDocChunk" c
       WHERE c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      `[${queryVector.join(',')}]`,
      topK,
    );

    return results
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => r.content)
      .join('\n---\n');
  }
}
