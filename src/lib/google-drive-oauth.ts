import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"] as const;

export function getOAuthRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/api/auth/google/callback`;
}

export function createOAuth2Client() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new Error(
      "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET são necessários para o modo simples (OAuth)."
    );
  }
  return new google.auth.OAuth2(id, secret, getOAuthRedirectUri());
}

/** Inicia fluxo OAuth; `state` assinado com ADMIN_API_SECRET (CSRF + expiração). */
export function buildGoogleAuthUrl(): string {
  const oauth2 = createOAuth2Client();
  const adminSecret = process.env.ADMIN_API_SECRET;
  if (!adminSecret) {
    throw new Error("ADMIN_API_SECRET não configurado");
  }
  const exp = Date.now() + 15 * 60 * 1000;
  const n = randomBytes(16).toString("hex");
  const payload = Buffer.from(JSON.stringify({ exp, n }), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", adminSecret)
    .update(payload)
    .digest("base64url");
  const state = `${payload}.${sig}`;

  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...SCOPES],
    state,
  });
}

export function verifyGoogleAuthState(state: string): boolean {
  const adminSecret = process.env.ADMIN_API_SECRET;
  if (!adminSecret) return false;
  const parts = state.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", adminSecret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const data = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as { exp: number };
  return Date.now() <= data.exp;
}

export async function exchangeGoogleAuthCode(code: string) {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}
