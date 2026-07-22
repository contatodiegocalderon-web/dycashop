import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoPagoPayment } from "@/lib/mercadopago";

export const runtime = "nodejs";

function extractPaymentId(request: NextRequest, body: unknown): string | null {
  const url = new URL(request.url);
  const queryId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    url.searchParams.get("payment_id");
  if (queryId) return queryId;

  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const data = o.data;
    if (data && typeof data === "object") {
      const id = (data as Record<string, unknown>).id;
      if (id != null) return String(id);
    }
    if (o.id != null) return String(o.id);
  }
  return null;
}

async function deductStockForOrder(orderId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: items, error: iErr } = await admin
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);

  if (iErr || !items?.length) {
    return iErr?.message ?? "Itens do pedido não encontrados.";
  }

  const totals = new Map<string, number>();
  for (const it of items) {
    if (!it.product_id) continue;
    totals.set(
      it.product_id,
      (totals.get(it.product_id) ?? 0) + Number(it.quantity ?? 0)
    );
  }

  for (const [productId, qty] of Array.from(totals.entries())) {
    const { data: product, error: pErr } = await admin
      .from("products")
      .select("id, stock, status")
      .eq("id", productId)
      .single();
    if (pErr || !product) {
      return `Produto ${productId} não encontrado.`;
    }
    const available = Number(product.stock ?? 0);
    if (available <= 0) {
      return `Produto ${productId} sem estoque.`;
    }
    const deducted = Math.min(available, qty);
    const newStock = available - deducted;
    const { error: uErr } = await admin
      .from("products")
      .update({
        stock: newStock,
        status: newStock <= 0 ? "ESGOTADO" : product.status,
      })
      .eq("id", productId);
    if (uErr) return uErr.message;
    if (newStock <= 0) {
      await admin.from("products").delete().eq("id", productId);
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const paymentId = extractPaymentId(request, body);
  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
    }

    if (payment.status !== "approved") {
      return NextResponse.json({ ok: true, status: payment.status });
    }

    const orderId = String(payment.external_reference ?? "").trim();
    if (!orderId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const admin = createAdminClient();
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status, checkout_channel")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr || !order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    if (order.status === "PAGO") {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    if (order.status !== "PENDENTE_PAGAMENTO") {
      return NextResponse.json({ ok: true, ignored: true, status: order.status });
    }

    const stockErr = await deductStockForOrder(orderId);
    if (stockErr) {
      console.error("[mp-webhook] stock:", stockErr);
      return NextResponse.json({ error: stockErr }, { status: 409 });
    }

    const confirmedAt = new Date().toISOString();
    const { error: uErr } = await admin
      .from("orders")
      .update({
        status: "PAGO",
        confirmed_at: confirmedAt,
        mp_payment_id: String(payment.id),
      })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, orderId, paymentId: payment.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
