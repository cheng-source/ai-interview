import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PositionService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.position.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    return this.prisma.position.findUnique({ where: { id } });
  }

  async create(data: { title: string; department: string; jdText: string; techStack: string[]; level: string }) {
    return this.prisma.position.create({ data });
  }

  async update(id: string, data: Partial<{ title: string; department: string; jdText: string; techStack: string[]; level: string }>) {
    return this.prisma.position.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.position.delete({ where: { id } });
  }
}
