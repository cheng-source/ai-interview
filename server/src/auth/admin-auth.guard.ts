import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = String(req.headers?.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match || !this.authService.verifyAdminToken(match[1])) {
      throw new UnauthorizedException("Admin authentication required");
    }
    return true;
  }
}
