import { Controller, Get, Post, Param, Body, Sse, MessageEvent, Res, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InterviewService } from './interview.service';
import { Observable } from 'rxjs';
import type { Response } from 'express';

@Controller('api/interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Get()
  async list() {
    return this.interviewService.findAll();
  }

  @Post()
  async create(@Body() body: { candidateId: string; positionId: string; interviewType: string }) {
    return this.interviewService.createInterview(body.candidateId, body.positionId, body.interviewType);
  }

  @Get(':id/state')
  async getState(@Param('id') id: string) {
    return this.interviewService.getInterviewState(id);
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @Body() body: { resumeText: string }, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      for await (const event of this.interviewService.startStream(id, body.resumeText)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message || String(e) })}\n\n`);
    }
    res.end();
  }

  @Get(':id/stream')
  @Sse()
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        for await (const event of this.interviewService.interviewStream(id)) {
          subscriber.next({ data: event } as MessageEvent);
        }
        subscriber.complete();
      })();
    });
  }

  @Post(':id/message')
  async sendMessage(@Param('id') id: string, @Body() body: { message: string }, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      for await (const event of this.interviewService.interviewStream(id, body.message)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message || String(e) })}\n\n`);
    }
    res.end();
  }

  @Post('upload-resume')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadResume(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传文件');
    const text = await this.interviewService.extractResumeText(file);
    return { text };
  }
}
