import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createInterviewGraph } from '../langgraph/interview.graph';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

@Injectable()
export class InterviewService {
  private graph: ReturnType<typeof createInterviewGraph>;
  private checkpointer: MemorySaver;

  constructor(private prisma: PrismaService) {
    this.checkpointer = new MemorySaver();
    this.graph = createInterviewGraph().compile({ checkpointer: this.checkpointer });
  }

  async createInterview(candidateId: string, positionId: string, interviewType: string) {
    const threadId = `interview-${Date.now()}`;
    return this.prisma.interview.create({
      data: { candidateId, positionId, threadId, status: 'pending', interviewType },
      include: { candidate: true, position: true },
    });
  }

  async startInterview(interviewId: string, resumeText: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
    if (!interview) throw new Error('Interview not found');

    const initialState = {
      candidate: {
        name: interview.candidate.name,
        skills: [], experience: 0, projects: [], strengths: [], gaps: [],
      },
      position: {
        title: interview.position.title,
        department: interview.position.department,
        jdText: interview.position.jdText,
        techStack: interview.position.techStack,
      },
      resumeText,
      interviewType: interview.interviewType || 'technical',
    };

    const config = { configurable: { thread_id: interview.threadId } };
    await this.graph.invoke(initialState, config);

    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { status: 'in_progress', startedAt: new Date() },
    });
  }

  async *streamInterview(interviewId: string, userMessage?: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, position: true },
    });
    if (!interview) throw new Error('Interview not found');

    const config = { configurable: { thread_id: interview.threadId } };

    if (userMessage) {
      const stream = await this.graph.stream(
        { candidateAnswer: userMessage, messages: [new HumanMessage(userMessage)] },
        config,
      );

      for await (const chunk of stream) {
        const nodeName = Object.keys(chunk)[0];
        const nodeData = chunk[nodeName] as any;
        if (nodeData?.messages?.length) {
          for (const msg of nodeData.messages) {
            if (msg.content) {
              yield { type: 'message', content: msg.content, stage: nodeName };
            }
          }
        }
        if (nodeData?.currentStage === 'done') {
          yield { type: 'done', report: nodeData.finalReport };

          await this.prisma.interview.update({
            where: { id: interviewId },
            data: { status: 'completed', endedAt: new Date(), stateJson: nodeData },
          });
        }
      }
    } else {
      const state = await this.graph.getState(config);
      if (state?.values) {
        const values = state.values as any;
        if (values.messages?.length) {
          for (const msg of values.messages.slice(-3)) {
            if (msg.content) {
              yield { type: 'message', content: msg.content, stage: values.currentStage };
            }
          }
        }
      }
    }
  }

  async getInterviewState(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new Error('Interview not found');
    const config = { configurable: { thread_id: interview.threadId } };
    const state = await this.graph.getState(config);
    return state?.values || null;
  }
}
