import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { clearDriveAuthCache } from "@/lib/drive-auth";
import { buildGoogleAuthUrl } from "@/lib/google-drive-oauth";
import { getAdminClient } from "@/lib/supabase/admin";

/** POST → devolve URL para abrir no browser e autorizar o Drive (modo simples). */
export async function POST(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    let force = false;
    try {
      const body = (await request.json()) as { force?: boolean };
      force = body?.force === true;
    } catch {
      /* corpo vazio */
    }

    if (force) {
      const admin = getAdminClient();
      await admin
        .from("catalog_settings")
        .update({ google_refresh_token: null, google_oauth_client_id: null })
        .eq("id", 1);
      clearDriveAuthCache();
    }

    const url = buildGoogleAuthUrl(request.nextUrl.origin);
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao iniciar OAuth";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
