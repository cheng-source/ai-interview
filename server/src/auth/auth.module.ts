import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AdminAuthGuard } from "./admin-auth.guard";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard],
  exports: [AuthService, AdminAuthGuard],
})
export class AuthModule {}
