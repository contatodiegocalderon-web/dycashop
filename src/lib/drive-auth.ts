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
    .update({
      google_refresh_token: null,
      google_oauth_client_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  clearDriveAuthCache();
}

export function getOAuthClientIdHint(clientId?: string | null): string | null {
  const id = (clientId ?? process.env.GOOGLE_CLIENT_ID)?.trim();
  if (!id) return null;
  const dash = id.indexOf("-");
  if (dash >= 0 && dash < id.length - 1) {
    return id.slice(dash + 1, dash + 13);
  }
  return id.slice(0, 12);
}

export function getOAuthClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

function oauthRefreshErrorHint(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("invalid_grant") || lower.includes("invalid grant")) {
    const hint = getOAuthClientIdHint();
    return (
      `invalid_grant: credenciais OAuth deste servidor não coincidem com o token guardado (comum na Vercel com GOOGLE_CLIENT_ID antigo). ` +
      `Na Vercel, defina GOOGLE_CLIENT_ID=543934835594-7195cqo60j5jimda5h605haq9nmdv8qi.apps.googleusercontent.com e o GOOGLE_CLIENT_SECRET novo, redeploy, depois em Configuração clique «Conectar conta Google». ` +
      (hint ? `Cliente activo neste pedido: ${hint}…` : "")
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
    .select("google_refresh_token, google_oauth_client_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("catalog_settings:", error.message);
  }

  const rt = data?.google_refresh_token?.trim();
  const storedClientId = data?.google_oauth_client_id?.trim() || null;
  const currentClientId = getOAuthClientId();
  const hasOAuthEnv =
    !!currentClientId && !!process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (
    rt &&
    hasOAuthEnv &&
    storedClientId &&
    currentClientId &&
    storedClientId !== currentClientId
  ) {
    throw new Error(
      `OAuth: o token foi emitido para outro cliente Google (${getOAuthClientIdHint(storedClientId)}…) mas este servidor usa ${getOAuthClientIdHint(currentClientId)}…. Alinhe GOOGLE_CLIENT_ID/SECRET na Vercel com o cliente novo e clique «Conectar conta Google». Não abra localhost e produção ao mesmo tempo com credenciais diferentes.`
    );
  }

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
