import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.companyDoc.findMany({ orderBy: { uploadedAt: 'desc' } });
  }

  async upload(title: string, content: string, category: string) {
    return this.prisma.companyDoc.create({ data: { title, content, category } });
  }

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

  async remove(id: string) {
    return this.prisma.companyDoc.delete({ where: { id } });
  }
}
