import { NextRequest, NextResponse } from "next/server";
import {
  createOAuth2Client,
  exchangeGoogleAuthCode,
  resolveAppBaseUrl,
  resolveOAuthRedirectUri,
  verifyGoogleAuthState,
  verifyGoogleRefreshToken,
} from "@/lib/google-drive-oauth";
import { getOAuthClientId } from "@/lib/drive-auth";
import { supabaseFailureHint } from "@/lib/supabase-connect-hint";
import { clearDriveAuthCache } from "@/lib/drive-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Redirecionamento que funciona mesmo se o browser não seguir 302 de imediato. */
function redirectToConfig(
  request: NextRequest,
  query: Record<string, string>
) {
  const destBase = resolveAppBaseUrl(request.nextUrl.origin);
  const params = new URLSearchParams(query);
  const target = new URL(
    `/admin/configuracao?${params.toString()}`,
    destBase
  ).toString();

  const safeTarget = target.replace(/"/g, "%22");
  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${safeTarget}" />
  <title>A ligar Google Drive…</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; color: #444; }
    a { color: #5b21b6; }
  </style>
</head>
<body>
  <p>A redirecionar para configuração…</p>
  <p><a href="${safeTarget}">Clique aqui se não for redirecionado</a>.</p>
  <script>window.location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 302,
    headers: {
      Location: target,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const redirectUri = resolveOAuthRedirectUri(request.nextUrl.origin);

  const fail = (reason: string) =>
    redirectToConfig(request, { google_error: reason });

  try {
    const err = request.nextUrl.searchParams.get("error");
    if (err) {
      const errDesc =
        request.nextUrl.searchParams.get("error_description") ?? "";
      return fail(
        errDesc
          ? `Google: ${err} — ${decodeURIComponent(errDesc)}`
          : `Google: ${err}`
      );
    }

    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    if (!state || !code) {
      return fail("Resposta OAuth incompleta.");
    }

    if (!verifyGoogleAuthState(state)) {
      return fail("Estado OAuth inválido ou expirado. Tente novamente.");
    }

    let tokens: Awaited<ReturnType<typeof exchangeGoogleAuthCode>>;
    try {
      tokens = await exchangeGoogleAuthCode(code, redirectUri);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao trocar código";
      return fail(msg);
    }

    const newRt = tokens.refresh_token?.trim() || null;

    let admin;
    try {
      admin = getAdminClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Supabase";
      return fail(supabaseFailureHint(msg));
    }

    const { data: row, error: selErr } = await admin
      .from("catalog_settings")
      .select("drive_folder_id, google_refresh_token, google_oauth_client_id")
      .eq("id", 1)
      .maybeSingle();

    if (selErr) {
      return fail(supabaseFailureHint(selErr.message));
    }

    let refreshToStore: string;
    if (newRt) {
      refreshToStore = newRt;
    } else {
      const oldRt = row?.google_refresh_token?.trim();
      if (!oldRt) {
        return fail(
          "Google não devolveu refresh token. Em myaccount.google.com/permissions remova o acesso desta app e clique «Conectar conta Google» de novo."
        );
      }
      const stillValid = await verifyGoogleRefreshToken(oldRt, redirectUri);
      if (!stillValid) {
        return fail(
          "O Google não emitiu um novo refresh token e o guardado na base de dados já não funciona (invalid_grant). Em myaccount.google.com/permissions remova o acesso desta app, volte a Configuração e clique «Conectar conta Google» — não atualize esta página do callback."
        );
      }
      refreshToStore = oldRt;
    }

    const oauth2 = createOAuth2Client(redirectUri);
    oauth2.setCredentials({ refresh_token: refreshToStore });
    try {
      await oauth2.getAccessToken();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(
        msg.toLowerCase().includes("invalid_grant")
          ? "Refresh token rejeitado pelo Google após autorização. Confirme que GOOGLE_CLIENT_ID/SECRET no .env são os mesmos da app OAuth no Google Cloud; remova o acesso em myaccount.google.com/permissions e conecte de novo."
          : msg
      );
    }

    const oauthClientId = getOAuthClientId();
    if (!oauthClientId) {
      return fail("GOOGLE_CLIENT_ID não configurado no servidor.");
    }

    const { error: upErr } = await admin.from("catalog_settings").upsert(
      {
        id: 1,
        google_refresh_token: refreshToStore,
        google_oauth_client_id: oauthClientId,
        drive_folder_id: row?.drive_folder_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (upErr) {
      return fail(supabaseFailureHint(upErr.message));
    }

    clearDriveAuthCache();
    return redirectToConfig(request, { google: "ok" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[google/callback]", msg);
    return fail(msg);
  }
}
