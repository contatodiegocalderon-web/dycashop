import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

/** POST — incrementa contador de cliques WhatsApp (carrinho abandonado). */
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
      String((body as { customer_whatsapp?: string })?.customer_whatsapp ?? "")
    );
    if (wa.length < 12) {
      return NextResponse.json(
        { error: "WhatsApp inválido" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: existing, error: selErr } = await admin
      .from("crm_abandoned_whatsapp_clicks")
      .select("click_count")
      .eq("whatsapp_digits", wa)
      .maybeSingle();

    if (selErr) {
      const missing = /does not exist|schema cache|relation/i.test(selErr.message);
      if (missing) {
        return NextResponse.json(
          {
            error:
              "Tabela de cliques em falta. Execute supabase/migration_crm_abandoned_whatsapp_clicks.sql.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const nextCount = (existing?.click_count ?? 0) + 1;
    const { error: upErr } = await admin
      .from("crm_abandoned_whatsapp_clicks")
      .upsert(
        {
          whatsapp_digits: wa,
          click_count: nextCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "whatsapp_digits" }
      );

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, click_count: nextCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
