import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isConfirmLockPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (!("_confirm_lock" in o)) return false;
  const keys = Object.keys(o);
  return keys.length === 1 && keys[0] === "_confirm_lock";
}

/**
 * POST /api/admin/orders/[orderId]/unlock-confirm-lock
 * Remove o lock deixado após falha ao renomear no Drive na confirmação, para poder tentar de novo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  const orderId = params.orderId?.trim() ?? "";
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "ID de pedido inválido" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status, sale_amount_by_category")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (order.status !== "PENDENTE_PAGAMENTO") {
      return NextResponse.json(
        { error: "Só é possível desbloquear pedidos ainda pendentes de pagamento." },
        { status: 400 }
      );
    }
    if (!isConfirmLockPayload(order.sale_amount_by_category)) {
      return NextResponse.json(
        {
          error:
            "Este pedido não tem bloqueio de confirmação por Drive (ou já foi alterado). Atualize a lista.",
        },
        { status: 400 }
      );
    }

    const { error: uErr } = await admin
      .from("orders")
      .update({ sale_amount_by_category: null })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
