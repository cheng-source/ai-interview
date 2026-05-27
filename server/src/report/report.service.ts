import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  async getByInterview(interviewId: string) {
    return this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
  }

  async getAll() {
    return this.prisma.interview.findMany({
      where: { status: 'completed' },
      include: { candidate: true, position: true },
      orderBy: { endedAt: 'desc' },
    });
  }
}
