import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/admin/orders/[orderId]
 * Remove um pedido confirmado (PAGO) do histórico; as métricas deixam de contar o pedido
 * porque deixam de existir linhas em `orders` / `order_items`.
 * Só dono (sessão owner) ou chave API admin.
 * Não altera stock nem nomes de ficheiros no Drive (mantém o estado após a confirmação).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    await assertOwnerAccess(_request);
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
      .select("id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (order.status !== "PAGO") {
      return NextResponse.json(
        { error: "Só é possível excluir pedidos já confirmados (histórico)." },
        { status: 400 }
      );
    }

    const { error: dErr } = await admin.from("orders").delete().eq("id", orderId);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
