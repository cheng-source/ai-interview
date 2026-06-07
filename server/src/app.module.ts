import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PositionModule } from './position/position.module';
import { CandidateModule } from './candidate/candidate.module';
import { InterviewModule } from './interview/interview.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ReportModule } from './report/report.module';
import { LlmProviderModule } from './llm-provider/llm-provider.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PositionModule,
    CandidateModule,
    InterviewModule,
    KnowledgeModule,
    ReportModule,
    LlmProviderModule,
  ],
})
export class AppModule {}
