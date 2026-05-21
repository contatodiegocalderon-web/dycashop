import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { recordCancelledReceiptToken } from "@/lib/order-receipt";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders/cancel/[orderId]
 * Marca pedido como CANCELADO (mantém na BD para remarketing em Clientes → Carrinhos abandonados).
 * Não repõe stock: confirmação é que baixa. O recibo mostra mensagem de cancelado.
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
      .select("id, status, public_token")
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

    const tokenSaved = await recordCancelledReceiptToken(
      (order as { public_token?: string | null }).public_token
    );
    if (!tokenSaved.ok) {
      return NextResponse.json(
        {
          error: tokenSaved.error,
          hint: "Execute supabase/migration_cancelled_receipt_tokens.sql no Supabase.",
        },
        { status: 500 }
      );
    }

    const { error: uErr } = await admin
      .from("orders")
      .update({
        status: "CANCELADO",
        updated_at: new Date().toISOString(),
      })
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
