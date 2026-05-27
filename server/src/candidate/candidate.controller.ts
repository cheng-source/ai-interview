import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { CandidateService } from './candidate.service';

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

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.candidateService.update(id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.candidateService.remove(id); }
}
