import { Controller, UseGuards, Get, Param } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ReportService } from './report.service';

@UseGuards(AdminAuthGuard)
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
