import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * POST /api/admin/metrics/reset
 * Limpa os campos de métricas dos pedidos pagos para reiniciar o histórico.
 */
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
    const admin = createAdminClient();
    const { data: orders, error: listErr } = await admin
      .from("orders")
      .select("id")
      .eq("status", "PAGO");
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }
    const ids = (orders ?? []).map((o) => o.id as string);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, resetCount: 0 });
    }
    const { error: updErr } = await admin
      .from("orders")
      .update({
        sale_amount: null,
        sale_amount_by_category: null,
        customer_segment: null,
        confirmed_at: null,
        confirmed_by_staff_id: null,
      })
      .in("id", ids);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, resetCount: ids.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

