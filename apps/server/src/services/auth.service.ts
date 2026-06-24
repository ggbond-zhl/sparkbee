import { SESSION_TTL_SECONDS } from "../config/constant";
import { randomToken, safeEqual, sign } from "../utils/crypto";

export interface AuthSession {
  subject: "admin";
  expiresAt: number;
}

interface TokenPayload extends AuthSession {
  nonce: string;
}

export class AuthService {
  constructor(
    private readonly adminPassword: string,
    private readonly sessionSecret: string,
  ) {}

  login(password: string): string | null {
    if (!safeEqual(password, this.adminPassword)) {
      return null;
    }

    const payload: TokenPayload = {
      subject: "admin",
      expiresAt: Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS,
      nonce: randomToken(16)
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${sign(body, this.sessionSecret)}`;
  }

  verify(token: string | undefined): AuthSession | null {
    if (token === undefined) {
      return null;
    }

    const [body, signature] = token.split(".");
    if (body === undefined || signature === undefined) {
      return null;
    }

    if (!safeEqual(signature, sign(body, this.sessionSecret))) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
      if (payload.subject !== "admin" || payload.expiresAt < Math.floor(Date.now() / 1_000)) {
        return null;
      }

      return {
        subject: payload.subject,
        expiresAt: payload.expiresAt
      };
    } catch {
      return null;
    }
  }
}
