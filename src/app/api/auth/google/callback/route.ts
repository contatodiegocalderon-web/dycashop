import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleAuthCode,
  resolveOAuthRedirectUri,
  verifyGoogleAuthState,
} from "@/lib/google-drive-oauth";
import { supabaseFailureHint } from "@/lib/supabase-connect-hint";
import { clearDriveAuthCache } from "@/lib/drive-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function appBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    request.nextUrl.origin
  );
}

/** Redirecionamento que funciona mesmo se o browser não seguir 302 de imediato. */
function redirectToConfig(
  request: NextRequest,
  query: Record<string, string>
) {
  const destBase = appBaseUrl(request);
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

    const newRt = tokens.refresh_token;

    let admin;
    try {
      admin = getAdminClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Supabase";
      return fail(supabaseFailureHint(msg));
    }

    const { data: row, error: selErr } = await admin
      .from("catalog_settings")
      .select("drive_folder_id, google_refresh_token")
      .eq("id", 1)
      .maybeSingle();

    if (selErr) {
      return fail(supabaseFailureHint(selErr.message));
    }

    const refreshToStore = newRt ?? row?.google_refresh_token?.trim();
    if (!refreshToStore) {
      return fail(
        "Google não devolveu refresh token. Remova o acesso da app em myaccount.google.com/permissions e conecte de novo."
      );
    }

    const { error: upErr } = await admin.from("catalog_settings").upsert(
      {
        id: 1,
        google_refresh_token: refreshToStore,
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
