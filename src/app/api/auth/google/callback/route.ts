import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleAuthCode, verifyGoogleAuthState } from "@/lib/google-drive-oauth";
import { supabaseFailureHint } from "@/lib/supabase-connect-hint";
import { createAdminClient } from "@/lib/supabase/admin";

function logOAuthCallback(
  step: string,
  data: Record<string, unknown> & { hypothesisId?: string }
) {
  // #region agent log
  fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c8fae6",
    },
    body: JSON.stringify({
      sessionId: "c8fae6",
      location: `google/callback:${step}`,
      message: step,
      data: { ...data, ts: Date.now() },
      hypothesisId: data.hypothesisId ?? step,
    }),
  }).catch(() => {});
  // #endregion
}

function baseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    request.nextUrl.origin
  );
}

export async function GET(request: NextRequest) {
  const destBase = baseUrl(request);
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `/admin/configuracao?google_error=${encodeURIComponent(reason)}`,
        destBase
      )
    );

  const err = request.nextUrl.searchParams.get("error");
  if (err) {
    const errDesc = request.nextUrl.searchParams.get("error_description") ?? "";
    logOAuthCallback("google_query_error", {
      err,
      errDescSnippet: errDesc.slice(0, 120),
      hypothesisId: "H-A",
    });
    return fail(
      errDesc
        ? `Google: ${err} — ${decodeURIComponent(errDesc)}`
        : `Google: ${err}`
    );
  }

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!state || !code) {
    logOAuthCallback("missing_code_or_state", {
      hasState: !!state,
      hasCode: !!code,
      hypothesisId: "H-B",
    });
    return fail("Resposta OAuth incompleta.");
  }

  if (!verifyGoogleAuthState(state)) {
    logOAuthCallback("state_invalid", { hypothesisId: "H-C" });
    return fail("Estado OAuth inválido ou expirado. Tente novamente.");
  }

  let tokens: Awaited<ReturnType<typeof exchangeGoogleAuthCode>>;
  try {
    tokens = await exchangeGoogleAuthCode(code);
    logOAuthCallback("token_exchange_ok", {
      hasRefreshToken: !!tokens.refresh_token,
      hypothesisId: "H-D",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao trocar código";
    logOAuthCallback("token_exchange_fail", {
      msgSnippet: msg.slice(0, 200),
      hypothesisId: "H-D",
    });
    return fail(msg);
  }

  const newRt = tokens.refresh_token;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Supabase";
    return fail(supabaseFailureHint(msg));
  }

  try {
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
      logOAuthCallback("no_refresh_token", {
        hadExistingRow: !!row,
        hypothesisId: "H-D",
      });
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
      logOAuthCallback("supabase_upsert_fail", {
        msgSnippet: upErr.message.slice(0, 120),
        hypothesisId: "H-E",
      });
      return fail(supabaseFailureHint(upErr.message));
    }
    logOAuthCallback("oauth_success_redirect", { hypothesisId: "ok" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logOAuthCallback("catalog_try_catch", {
      msgSnippet: msg.slice(0, 160),
      hypothesisId: "H-E",
    });
    return fail(supabaseFailureHint(msg));
  }

  return NextResponse.redirect(
    new URL("/admin/configuracao?google=ok", destBase)
  );
}
