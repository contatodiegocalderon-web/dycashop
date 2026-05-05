import type { JWT } from "google-auth-library";
import { OAuth2Client } from "google-auth-library";
import { createOAuth2Client } from "@/lib/google-drive-oauth";
import { getDriveJwtAuth } from "@/lib/google-drive-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type DriveAuthClient = JWT | OAuth2Client;

export async function ensureDriveAuthorized(auth: DriveAuthClient): Promise<void> {
  if (auth instanceof OAuth2Client) {
    await auth.getAccessToken();
    return;
  }
  await (auth as JWT).authorize();
}

/**
 * Preferência: refresh token OAuth (modo simples, sem JSON de conta de serviço).
 * Fallback: conta de serviço no .env (avançado).
 */
export async function getDriveAuth(): Promise<DriveAuthClient> {
  const admin = createAdminClient();
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
    return oauth2;
  }

  if (hasOAuthEnv && !rt) {
    throw new Error(
      "OAuth configurado mas esta loja ainda não autorizou o Google Drive. Abra /admin/configuracao, use a chave admin e clique em «Conectar conta Google»."
    );
  }

  return getDriveJwtAuth();
}
