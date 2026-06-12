import { Controller, UseGuards, Get, Post, Put, Delete, Param, Body, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { CandidateService } from './candidate.service';

@UseGuards(AdminAuthGuard)
@Controller('api/candidates')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Get()
  findAll() { return this.candidateService.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.candidateService.findOne(id); }

  @Post()
  create(@Body() body: { name: string; email: string; phone: string; positionId: string; resumeUrl?: string }) {
    return this.candidateService.create(body);
  }

  @Post(':id/resume')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadResume(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传文件');
    const text = await this.candidateService.extractResumeText(file);
    await this.candidateService.update(id, { resumeText: text, resumeUrl: file.originalname });
    return { text, fileName: file.originalname };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.candidateService.update(id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.candidateService.remove(id); }

  @Post('batch-delete')
  batchRemove(@Body('ids') ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('ids 不能为空');
    return this.candidateService.batchRemove(ids);
  }
}
