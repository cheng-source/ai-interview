import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  nonce: string;
  ciphertext: string;
}

export class LlmProviderCrypto {
  private readonly key: Buffer;

  constructor(secret = process.env.LLM_PROVIDER_ENCRYPTION_KEY || "ai-interview-dev-provider-key") {
    this.key = createHash("sha256").update(secret).digest();
  }

  encrypt(value: string): EncryptedSecret {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      nonce: nonce.toString("base64"),
      ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    };
  }

  decrypt(value: EncryptedSecret): string {
    const nonce = Buffer.from(value.nonce, "base64");
    const payload = Buffer.from(value.ciphertext, "base64");
    const encrypted = payload.subarray(0, payload.length - 16);
    const tag = payload.subarray(payload.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, nonce);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  mask(value?: string | null): string {
    if (!value || value.length <= 6) return "***";
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }
}
