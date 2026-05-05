import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleAuthCode, verifyGoogleAuthState } from "@/lib/google-drive-oauth";
import { supabaseFailureHint } from "@/lib/supabase-connect-hint";
import { createAdminClient } from "@/lib/supabase/admin";

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
    return fail(`Google: ${err}`);
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
    tokens = await exchangeGoogleAuthCode(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao trocar código";
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(supabaseFailureHint(msg));
  }

  return NextResponse.redirect(
    new URL("/admin/configuracao?google=ok", destBase)
  );
}
