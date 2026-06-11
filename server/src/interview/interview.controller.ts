import { Controller, Get, Post, Param, Body, Sse, MessageEvent, Res, UseInterceptors, UploadedFile, BadRequestException, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InterviewService } from './interview.service';
import { map, Observable } from 'rxjs';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { Request, Response } from 'express';

@Controller('api/interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  private interviewToken(req: Request, queryToken?: string): string | undefined {
    return queryToken || String(req.headers['x-interview-token'] || '') || undefined;
  }

  private async assertInterviewAccess(id: string, req: Request, queryToken?: string) {
    try {
      await this.interviewService.assertInterviewAccess(id, this.interviewToken(req, queryToken));
    } catch {
      throw new UnauthorizedException('Interview token is invalid or expired');
    }
  }

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
  @UseGuards(AdminAuthGuard)
  async list() {
    return this.interviewService.findAll();
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  async create(@Body() body: { candidateId: string; positionId: string; interviewType: string }) {
    return this.interviewService.createInterview(body.candidateId, body.positionId, body.interviewType);
  }

  @Post(':id/access-token')
  @UseGuards(AdminAuthGuard)
  async rotateAccessToken(@Param('id') id: string) {
    return this.interviewService.rotateInterviewAccessToken(id);
  }

  @Get(':id/state')
  async getState(@Param('id') id: string, @Req() req: Request, @Query('token') token?: string) {
    await this.assertInterviewAccess(id, req, token);
    return this.interviewService.getInterviewState(id);
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @Body() body: { resumeText: string }, @Req() req: Request, @Query('token') token: string | undefined, @Res() res: Response) {
    await this.assertInterviewAccess(id, req, token);
    this.writeSseStream(res, this.interviewService.startStream$(id, body.resumeText));
  }

  @Get(':id/stream')
  @Sse()
  async stream(@Param('id') id: string, @Req() req: Request, @Query('token') token?: string): Promise<Observable<MessageEvent>> {
    await this.assertInterviewAccess(id, req, token);
    return this.interviewService.interviewStream$(id).pipe(map((event) => ({ data: event }) as MessageEvent));
  }

  @Post(':id/message')
  async sendMessage(@Param('id') id: string, @Body() body: { message: string; clientMessageId?: string }, @Req() req: Request, @Query('token') token: string | undefined, @Res() res: Response) {
    await this.assertInterviewAccess(id, req, token);
    this.writeSseStream(res, this.interviewService.interviewStream$(id, body.message, body.clientMessageId));
  }

  @Post('upload-resume')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadResume(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传文件');
    const text = await this.interviewService.extractResumeText(file);
    return { text };
  }
}
