import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentClient } from "@/lib/mercadopago";
import { fulfillVarejoOrderPaid } from "@/lib/fulfill-varejo-order";

export const runtime = "nodejs";

/**
 * Webhook Mercado Pago (Checkout Pro).
 * Aceita query `?topic=payment&id=` (IPN) ou body JSON `{ type, data: { id } }`.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
      return NextResponse.json({ ok: true, skipped: "no_token" });
    }

    const url = new URL(request.url);
    let topic =
      url.searchParams.get("topic") ||
      url.searchParams.get("type") ||
      "";
    let paymentId =
      url.searchParams.get("id") ||
      url.searchParams.get("data.id") ||
      "";

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      if (!topic) topic = String(o.type ?? o.topic ?? "");
      const data = o.data as { id?: string | number } | undefined;
      if (!paymentId && data?.id != null) paymentId = String(data.id);
      if (!paymentId && o.id != null && topic.includes("payment")) {
        paymentId = String(o.id);
      }
    }

    // Merchant order notifications — ignore for fulfill (payment topic is enough)
    if (topic && !/payment/i.test(topic)) {
      return NextResponse.json({ ok: true, ignored: topic });
    }

    if (!paymentId) {
      return NextResponse.json({ ok: true, ignored: "no_payment_id" });
    }

    const paymentApi = createPaymentClient();
    const payment = await paymentApi.get({ id: paymentId });
    const status = String(payment.status ?? "");
    const externalRef = String(payment.external_reference ?? "").trim();
    const prefId = String(
      (payment as { preference_id?: string }).preference_id ?? ""
    ).trim();

    if (!externalRef) {
      return NextResponse.json({ ok: true, ignored: "no_external_reference" });
    }

    if (status !== "approved") {
      return NextResponse.json({
        ok: true,
        ignored: "not_approved",
        status,
      });
    }

    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("id, status, sales_channel")
      .eq("id", externalRef)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ ok: true, ignored: "order_not_found" });
    }

    // Só auto-confirma canal VAREJO
    if (order.sales_channel && order.sales_channel !== "VAREJO") {
      return NextResponse.json({ ok: true, ignored: "not_varejo" });
    }

    const result = await fulfillVarejoOrderPaid(admin, {
      orderId: order.id,
      paymentExternalId: paymentId || prefId,
    });

    if (!result.ok) {
      console.error("[mp webhook] fulfill failed:", result.error);
      // 200 evita retry infinito agressivo em erros de negócio; 5xx em falhas transitórias
      const retry = result.status >= 500;
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: retry ? 500 : 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      fulfilled: true,
      alreadyPaid: result.alreadyPaid ?? false,
    });
  } catch (e) {
    console.error("[mp webhook]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    );
  }
}

/** Alguns setups do MP fazem GET de verificação. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "mercadopago-webhook" });
}
