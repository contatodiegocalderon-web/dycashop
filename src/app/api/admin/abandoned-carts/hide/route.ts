import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { hideAbandonedContact } from "@/lib/crm-abandoned-query";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

/** POST — remove lead da etapa Abandonados (oculta contacto). */
export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    const wa = normalizeWhatsappDigits(
      String((body as Record<string, unknown>)?.customer_whatsapp ?? "")
    );
    if (wa.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    await hideAbandonedContact(admin, wa);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
