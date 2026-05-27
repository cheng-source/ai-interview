import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PositionModule } from './position/position.module';
import { CandidateModule } from './candidate/candidate.module';
import { InterviewModule } from './interview/interview.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ReportModule } from './report/report.module';

@Module({
  imports: [
    PrismaModule,
    PositionModule,
    CandidateModule,
    InterviewModule,
    KnowledgeModule,
    ReportModule,
  ],
})
export class AppModule {}
