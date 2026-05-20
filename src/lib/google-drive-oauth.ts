import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { google } from "googleapis";

/** Leitura + alteração de metadados/nomes (renomear fotos com stock). `drive.readonly` não permite `files.update`. */
const SCOPES = ["https://www.googleapis.com/auth/drive"] as const;

const DEFAULT_DEV_ORIGIN = "http://localhost:3000";

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** URI de callback registada no Google Cloud (deve coincidir com a troca do código). */
export function getOAuthRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? DEFAULT_DEV_ORIGIN;
  return `${base}/api/auth/google/callback`;
}

/**
 * Usa o origin do pedido atual quando é localhost/127.0.0.1,
 * para o redirect_uri da troca coincidir com o URL onde o Google devolveu o código.
 */
export function resolveOAuthRedirectUri(requestOrigin?: string | null): string {
  const fromEnv = getOAuthRedirectUri();
  if (!requestOrigin?.trim()) return fromEnv;

  let origin: string;
  try {
    origin = normalizeOrigin(new URL(requestOrigin).origin);
  } catch {
    return fromEnv;
  }

  const host = new URL(origin).hostname;
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!isLocal) {
    const envHost = new URL(fromEnv).hostname;
    if (host !== envHost) return fromEnv;
  }

  return `${origin}/api/auth/google/callback`;
}

export function createOAuth2Client(redirectUri?: string) {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new Error(
      "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET são necessários para o modo simples (OAuth)."
    );
  }
  return new google.auth.OAuth2(
    id,
    secret,
    redirectUri ?? getOAuthRedirectUri()
  );
}

/** Inicia fluxo OAuth; `state` assinado com ADMIN_API_SECRET (CSRF + expiração). */
export function buildGoogleAuthUrl(requestOrigin?: string | null): string {
  const redirectUri = resolveOAuthRedirectUri(requestOrigin);
  const oauth2 = createOAuth2Client(redirectUri);
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
    redirect_uri: redirectUri,
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
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { exp: number };
    return typeof data.exp === "number" && Date.now() <= data.exp;
  } catch {
    return false;
  }
}

export function formatOAuthExchangeError(detail: string): string {
  const lower = detail.toLowerCase();
  if (lower.includes("invalid_grant")) {
    return (
      "Código OAuth inválido ou já usado (invalid_grant). Não atualize esta página: volte a Configuração, clique «Conectar conta Google» de novo. Se repetir, em myaccount.google.com/permissions remova o acesso desta app e conecte outra vez."
    );
  }
  if (lower.includes("redirect_uri_mismatch")) {
    return (
      "redirect_uri_mismatch: o URI no Google Cloud deve ser exatamente o callback desta app (ex.: http://localhost:3000/api/auth/google/callback) e NEXT_PUBLIC_APP_URL deve usar o mesmo host (localhost, não 127.0.0.1, ou vice-versa)."
    );
  }
  return detail;
}

export async function exchangeGoogleAuthCode(
  code: string,
  redirectUri?: string
) {
  const uri = redirectUri ?? getOAuthRedirectUri();
  const oauth2 = createOAuth2Client(uri);
  try {
    const { tokens } = await oauth2.getToken({ code, redirect_uri: uri });
    return tokens;
  } catch (e: unknown) {
    const err = e as {
      message?: string;
      response?: {
        data?: { error?: string; error_description?: string };
      };
    };
    const d = err.response?.data;
    const detail =
      (typeof d?.error_description === "string" && d.error_description) ||
      (typeof d?.error === "string" && d.error) ||
      err.message ||
      "Falha ao trocar código OAuth";
    throw new Error(formatOAuthExchangeError(detail));
  }
}
