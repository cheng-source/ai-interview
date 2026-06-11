import { Body, Controller, UseGuards, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { LlmProviderService } from "./llm-provider.service";
import type { DefaultProviderDto, UpsertProviderDto } from "./dto";

@UseGuards(AdminAuthGuard)
@Controller("api/llm-providers")
export class LlmProviderController {
  constructor(private readonly service: LlmProviderService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get("default")
  getDefault() {
    return this.service.getDefault();
  }

  @Post()
  create(@Body() body: UpsertProviderDto) {
    return this.service.create(body);
  }

  @Put("default")
  updateDefault(@Body() body: DefaultProviderDto) {
    return this.service.updateDefault(body);
  }

  @Put("default-embedding")
  updateDefaultEmbedding(@Body() body: DefaultProviderDto) {
    return this.service.updateDefaultEmbedding(body);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: UpsertProviderDto) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  @Post(":id/test")
  test(@Param("id") id: string) {
    return this.service.testProvider(id);
  }

  @Post("reload")
  reload() {
    return this.service.reloadRuntimeSnapshot();
  }
}
