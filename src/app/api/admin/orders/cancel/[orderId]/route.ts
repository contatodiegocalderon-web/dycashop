import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders/cancel/[orderId]
 * Só cancela pedidos ainda pendentes (não repõe stock: confirmação é que baixa).
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

  const orderId = params.orderId;

  try {
    const admin = createAdminClient();

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (oErr || !order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (order.status !== "PENDENTE_PAGAMENTO") {
      return NextResponse.json(
        { error: "Só é possível cancelar pedidos ainda pendentes de pagamento" },
        { status: 400 }
      );
    }

    const { error: uErr } = await admin
      .from("orders")
      .update({ status: "CANCELADO" })
      .eq("id", orderId);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
