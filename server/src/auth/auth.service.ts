import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function parseDurationSeconds(value: string | undefined): number {
  if (!value) return 8 * 60 * 60;
  const match = value.match(/^(\d+)([smhd])?$/i);
  if (!match) return 8 * 60 * 60;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multiplier = unit === "d" ? 86400 : unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return amount * multiplier;
}

@Injectable()
export class AuthService {
  private readonly username = process.env.ADMIN_USERNAME || "admin";
  private readonly passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
  private readonly jwtSecret = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || "";
  private readonly expiresInSeconds = parseDurationSeconds(process.env.JWT_EXPIRES_IN);

  login(username: string, password: string) {
    if (!this.jwtSecret) throw new UnauthorizedException("JWT secret is not configured");
    if (username !== this.username || !this.verifyPassword(password)) {
      throw new UnauthorizedException("Invalid username or password");
    }
    return { accessToken: this.signAdminToken(username), expiresIn: this.expiresInSeconds };
  }

  verifyAdminToken(token: string): boolean {
    if (!this.jwtSecret || !token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [encodedHeader, encodedPayload, signature] = parts;
    const expected = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (!this.safeEqual(signature, expected)) return false;

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
      return payload?.typ === "admin" && payload?.sub === this.username && Date.now() < Number(payload.exp) * 1000;
    } catch {
      return false;
    }
  }

  private verifyPassword(password: string): boolean {
    if (!this.passwordHash) return false;
    if (this.passwordHash.startsWith("scrypt:")) {
      const [, salt, expected] = this.passwordHash.split(":");
      if (!salt || !expected) return false;
      const actual = scryptSync(password, salt, 64).toString("hex");
      return this.safeEqual(actual, expected);
    }
    return this.safeEqual(password, this.passwordHash);
  }

  private signAdminToken(username: string): string {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub: username, typ: "admin", iat: now, exp: now + this.expiresInSeconds };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private sign(value: string): string {
    return createHmac("sha256", this.jwtSecret).update(value).digest("base64url");
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
