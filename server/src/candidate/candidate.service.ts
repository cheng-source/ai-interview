import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CandidateService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.candidate.findMany({
      include: { position: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.candidate.findUnique({
      where: { id },
      include: { position: true },
    });
  }

  async create(data: { name: string; email: string; phone: string; positionId: string; resumeUrl?: string }) {
    return this.prisma.candidate.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.candidate.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.candidate.delete({ where: { id } });
  }
}
