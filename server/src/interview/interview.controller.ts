import { Controller, Get, Post, Param, Body, Sse, MessageEvent, Query } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { Observable } from 'rxjs';

@Controller('api/interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post()
  async create(@Body() body: { candidateId: string; positionId: string; interviewType: string }) {
    return this.interviewService.createInterview(body.candidateId, body.positionId, body.interviewType);
  }

  @Get(':id/state')
  async getState(@Param('id') id: string) {
    return this.interviewService.getInterviewState(id);
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @Body() body: { resumeText: string }) {
    await this.interviewService.startInterview(id, body.resumeText);
    return { status: 'started' };
  }

  @Get(':id/stream')
  @Sse()
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        for await (const event of this.interviewService.streamInterview(id)) {
          subscriber.next({ data: event } as MessageEvent);
        }
        subscriber.complete();
      })();
    });
  }

  @Post(':id/message')
  async sendMessage(@Param('id') id: string, @Body() body: { message: string }) {
    const events: any[] = [];
    for await (const event of this.interviewService.streamInterview(id, body.message)) {
      events.push(event);
    }
    return events;
  }
}
