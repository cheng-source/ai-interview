import { Controller, Get, Post, Param, Body, Sse, MessageEvent, Res, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InterviewService } from './interview.service';
import { map, Observable } from 'rxjs';
import type { Response } from 'express';

@Controller('api/interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  private writeSseHeaders(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  private writeSseEvent(res: Response, event: any) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  private writeSseStream(res: Response, stream$: Observable<any>) {
    this.writeSseHeaders(res);

    const subscription = stream$.subscribe({
      next: (event) => this.writeSseEvent(res, event),
      error: (error: any) => {
        this.writeSseEvent(res, { type: 'error', message: error?.message || String(error) });
        if (!res.writableEnded) res.end();
      },
      complete: () => {
        if (!res.writableEnded) res.end();
      },
    });

    res.on('close', () => subscription.unsubscribe());
  }

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
    this.writeSseStream(res, this.interviewService.startStream$(id, body.resumeText));
  }

  @Get(':id/stream')
  @Sse()
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.interviewService.interviewStream$(id).pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  @Post(':id/message')
  async sendMessage(@Param('id') id: string, @Body() body: { message: string }, @Res() res: Response) {
    this.writeSseStream(res, this.interviewService.interviewStream$(id, body.message));
  }

  @Post('upload-resume')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadResume(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传文件');
    const text = await this.interviewService.extractResumeText(file);
    return { text };
  }
}
