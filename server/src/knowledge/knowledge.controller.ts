import { Controller, Get, Post, Delete, Param, Body, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  findAll() { return this.knowledgeService.findAll(); }

  @Get('search')
  search(@Query('q') query: string) { return this.knowledgeService.search(query); }

  @Post()
  upload(@Body() body: { title: string; content: string; category: string }) {
    return this.knowledgeService.upload(body.title, body.content, body.category);
  }

  @Post('upload-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('category') category: string,
  ) {
    if (!file) throw new BadRequestException('请上传文件');
    return this.knowledgeService.uploadFile(title, category, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.knowledgeService.remove(id); }
}
