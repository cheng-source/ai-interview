import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
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

  @Delete(':id')
  remove(@Param('id') id: string) { return this.knowledgeService.remove(id); }
}
