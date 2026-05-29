import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import type { OrderItemRow } from "@/types";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

export type AbandonedOrderRow = {
  order_id: string;
  customer_whatsapp: string;
  customer_name: string | null;
  requested_seller_name: string | null;
  created_at: string;
  order_items: OrderItemRow[];
  whatsapp_click_count: number;
};

/**
 * Pedidos pendentes ou cancelados de clientes que ainda não têm nenhum pedido PAGO
 * (primeira compra não confirmada → remarketing em Carrinhos abandonados).
 */
export async function GET(request: NextRequest) {
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
    const admin = createAdminClient();

    const { data: paidRows, error: paidErr } = await admin
      .from("orders")
      .select("customer_whatsapp")
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    if (paidErr) {
      return NextResponse.json({ error: paidErr.message }, { status: 500 });
    }

    const registeredWa = new Set<string>();
    for (const row of paidRows ?? []) {
      const wa = normalizeWhatsappDigits(
        (row as { customer_whatsapp: string }).customer_whatsapp
      );
      if (wa.length >= 10) registeredWa.add(wa);
    }

    const { data: orders, error: oErr } = await admin
      .from("orders")
      .select(
        `
        id,
        customer_whatsapp,
        customer_name,
        requested_seller_name,
        created_at,
        order_items (
          id,
          order_id,
          product_id,
          quantity,
          snapshot_image_url,
          snapshot_original_name,
          snapshot_brand,
          snapshot_color,
          snapshot_size,
          snapshot_drive_file_id,
          snapshot_category,
          created_at
        )
      `
      )
      .in("status", ["PENDENTE_PAGAMENTO", "CANCELADO"])
      .not("customer_whatsapp", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }

    const carts: AbandonedOrderRow[] = [];
    const waForClicks = new Set<string>();

    for (const raw of orders ?? []) {
      const o = raw as {
        id: string;
        customer_whatsapp: string;
        customer_name: string | null;
        requested_seller_name: string | null;
        created_at: string;
        order_items?: OrderItemRow[] | null;
      };

      const wa = normalizeWhatsappDigits(o.customer_whatsapp);
      if (wa.length < 10 || registeredWa.has(wa)) continue;

      const items = o.order_items ?? [];

      waForClicks.add(wa);
      carts.push({
        order_id: o.id,
        customer_whatsapp: wa,
        customer_name: o.customer_name,
        requested_seller_name: o.requested_seller_name,
        created_at: o.created_at,
        order_items: items,
        whatsapp_click_count: 0,
      });
    }

    const clickMap = new Map<string, number>();
    if (waForClicks.size > 0) {
      const { data: clickRows, error: cErr } = await admin
        .from("crm_abandoned_whatsapp_clicks")
        .select("whatsapp_digits, click_count")
        .in("whatsapp_digits", Array.from(waForClicks));
      if (!cErr) {
        for (const row of clickRows ?? []) {
          const r = row as { whatsapp_digits: string; click_count: number };
          clickMap.set(r.whatsapp_digits, Number(r.click_count) || 0);
        }
      }
    }

    for (const cart of carts) {
      cart.whatsapp_click_count = clickMap.get(cart.customer_whatsapp) ?? 0;
    }

    return NextResponse.json({ orders: carts, total: carts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
