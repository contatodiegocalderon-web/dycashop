import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { buildGoogleAuthUrl } from "@/lib/google-drive-oauth";

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
    const url = buildGoogleAuthUrl();
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao iniciar OAuth";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
