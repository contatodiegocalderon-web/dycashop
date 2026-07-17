import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { CRM_ABANDONED_FOLLOW_UP_MAX } from "@/lib/crm-funnel";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

/**
 * POST /api/admin/abandoned-carts/follow-up
 * Regista um follow-up (máx. 3). Após o 3.º, descarta o lead (oculta da lista).
 */
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

    const { data: existing, error: selErr } = await admin
      .from("crm_abandoned_follow_ups")
      .select("follow_up_count")
      .eq("whatsapp_digits", wa)
      .maybeSingle();

    if (selErr) {
      const missing = /does not exist|schema cache|relation/i.test(selErr.message);
      if (missing) {
        return NextResponse.json(
          {
            error: "Tabela de follow-ups em falta.",
            hint: "Execute supabase/migration_crm_abandoned_follow_ups.sql",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const prev = Number(
      (existing as { follow_up_count?: number } | null)?.follow_up_count ?? 0
    );
    const next = Math.min(prev + 1, CRM_ABANDONED_FOLLOW_UP_MAX);

    const { error: upsErr } = await admin.from("crm_abandoned_follow_ups").upsert(
      {
        whatsapp_digits: wa,
        follow_up_count: next,
      },
      { onConflict: "whatsapp_digits" }
    );

    if (upsErr) {
      return NextResponse.json({ error: upsErr.message }, { status: 500 });
    }

    let discarded = false;
    if (next >= CRM_ABANDONED_FOLLOW_UP_MAX) {
      const { data: paid } = await admin
        .from("orders")
        .select("id")
        .eq("status", "PAGO")
        .eq("customer_whatsapp", wa)
        .limit(1);
      if (!(paid ?? []).length) {
        await admin.from("crm_hidden_contacts").upsert(
          { whatsapp_digits: wa },
          { onConflict: "whatsapp_digits" }
        );
        discarded = true;
      }
    }

    return NextResponse.json({
      ok: true,
      follow_up_count: next,
      follow_up_remaining: Math.max(0, CRM_ABANDONED_FOLLOW_UP_MAX - next),
      discarded,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
