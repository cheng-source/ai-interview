import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CandidateService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.candidate.findMany({
      include: { position: true, interviews: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.candidate.findUnique({
      where: { id },
      include: { position: true, interviews: true },
    });
  }

  async create(data: { name: string; email: string; phone: string; positionId: string; resumeUrl?: string }) {
    const existing = await this.prisma.candidate.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException("该邮箱已存在，请勿重复创建");
    return this.prisma.candidate.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.candidate.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.candidate.delete({ where: { id } });
  }

  async extractResumeText(file: Express.Multer.File): Promise<string> {
    const mimetype = file.mimetype;
    const ext = file.originalname?.split(".").pop()?.toLowerCase();

    if (mimetype === "application/pdf" || ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(file.buffer);
      return data.text || "";
    }
    if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
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
    return file.buffer.toString("utf-8");
  }
}
