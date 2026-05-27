import { Controller, Get, Param } from '@nestjs/common';
import { ReportService } from './report.service';

@Controller('api/reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  getAll() { return this.reportService.getAll(); }

  @Get(':interviewId')
  getByInterview(@Param('interviewId') interviewId: string) {
    return this.reportService.getByInterview(interviewId);
  }
}
