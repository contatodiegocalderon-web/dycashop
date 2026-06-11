import type { JWT } from "google-auth-library";
import { OAuth2Client } from "google-auth-library";
import { createOAuth2Client } from "@/lib/google-drive-oauth";
import { getDriveJwtAuth } from "@/lib/google-drive-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export type DriveAuthClient = JWT | OAuth2Client;

let cachedDriveAuth: DriveAuthClient | null = null;
let cachedDriveAuthAt = 0;
const DRIVE_AUTH_CACHE_MS = 10 * 60 * 1000;

export function clearDriveAuthCache(): void {
  cachedDriveAuth = null;
  cachedDriveAuthAt = 0;
}

function isInvalidGrantError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("invalid_grant") || msg.includes("invalid grant");
}

/** Remove refresh token inválido da BD (credenciais OAuth alteradas ou revogação). */
export async function clearStaleGoogleRefreshToken(): Promise<void> {
  const admin = getAdminClient();
  await admin
    .from("catalog_settings")
    .update({ google_refresh_token: null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  clearDriveAuthCache();
}

export function getOAuthClientIdHint(): string | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) return null;
  const dash = id.indexOf("-");
  if (dash >= 0 && dash < id.length - 1) {
    return id.slice(dash + 1, dash + 13);
  }
  return id.slice(0, 12);
}

function oauthRefreshErrorHint(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("invalid_grant") || lower.includes("invalid grant")) {
    return (
      "invalid_grant: o token Google na base de dados já não é válido (revogado, app OAuth alterada ou credenciais .env diferentes). Em /admin/configuracao clique «Conectar conta Google» de novo; se persistir, remova o acesso em myaccount.google.com/permissions e volte a conectar. Não atualize a página do callback do Google."
    );
  }
  return msg;
}

export async function ensureDriveAuthorized(auth: DriveAuthClient): Promise<void> {
  if (auth instanceof OAuth2Client) {
    try {
      await auth.getAccessToken();
    } catch (e) {
      if (isInvalidGrantError(e)) {
        await clearStaleGoogleRefreshToken().catch(() => {});
      }
      throw new Error(oauthRefreshErrorHint(e));
    }
    return;
  }
  await (auth as JWT).authorize();
}

/**
 * Preferência: refresh token OAuth (modo simples, sem JSON de conta de serviço).
 * Fallback: conta de serviço no .env (avançado).
 */
export async function getDriveAuth(): Promise<DriveAuthClient> {
  if (
    cachedDriveAuth &&
    Date.now() - cachedDriveAuthAt < DRIVE_AUTH_CACHE_MS
  ) {
    return cachedDriveAuth;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("catalog_settings")
    .select("google_refresh_token")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("catalog_settings:", error.message);
  }

  const rt = data?.google_refresh_token?.trim();
  const hasOAuthEnv =
    !!process.env.GOOGLE_CLIENT_ID?.trim() &&
    !!process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (rt && hasOAuthEnv) {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ refresh_token: rt });
    cachedDriveAuth = oauth2;
    cachedDriveAuthAt = Date.now();
    return oauth2;
  }

  if (hasOAuthEnv && !rt) {
    throw new Error(
      "OAuth configurado mas esta loja ainda não autorizou o Google Drive. Abra /admin/configuracao, use a chave admin e clique em «Conectar conta Google»."
    );
  }

  const jwt = getDriveJwtAuth();
  cachedDriveAuth = jwt;
  cachedDriveAuthAt = Date.now();
  return jwt;
}
