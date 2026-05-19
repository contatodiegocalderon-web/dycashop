import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import {
  isConfirmLockPayload,
  parseConfirmLock,
} from "@/lib/order-drive-retry";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/orders/[orderId]/unlock-confirm-lock
 * Remove o bloqueio e guarda quais produtos já estão OK no Drive para não renomear de novo.
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

    const lock = parseConfirmLock(order.sale_amount_by_category);
    const skipIds = Array.from(new Set(lock?.drive_ok ?? []));
    const failedIds = Array.from(
      new Set(
        (lock?.drive_errors ?? [])
          .map((e) => e.productId.trim())
          .filter((id) => id && id !== "_rollback")
      )
    );

    const nextPayload =
      skipIds.length > 0 || failedIds.length > 0
        ? {
            _drive_retry: {
              skip_ids: skipIds,
              failed_ids: failedIds,
              at: new Date().toISOString(),
            },
          }
        : null;

    const { error: uErr } = await admin
      .from("orders")
      .update({ sale_amount_by_category: nextPayload })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      drive_retry: nextPayload?._drive_retry ?? null,
      message:
        skipIds.length > 0
          ? `Bloqueio removido. Na próxima confirmação só ${failedIds.length > 0 ? failedIds.length : "as peças em falta"} serão enviadas ao Drive (${skipIds.length} já ficam de fora).`
          : "Bloqueio removido. Pode confirmar o pedido outra vez.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
