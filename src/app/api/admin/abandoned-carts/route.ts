import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import type { OrderItemRow, OrderStatus } from "@/types";

export const runtime = "nodejs";

export type AbandonedOrderRow = {
  order_id: string;
  display_number: number | null;
  status: Extract<OrderStatus, "PENDENTE_PAGAMENTO" | "CANCELADO">;
  customer_whatsapp: string;
  customer_name: string | null;
  customer_note: string | null;
  requested_seller_name: string | null;
  created_at: string;
  public_token: string | null;
  order_items: OrderItemRow[];
  total_pieces: number;
};

function normalizeWa(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

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
      const wa = normalizeWa(
        (row as { customer_whatsapp: string }).customer_whatsapp
      );
      if (wa.length >= 10) registeredWa.add(wa);
    }

    const { data: orders, error: oErr } = await admin
      .from("orders")
      .select(
        `
        id,
        display_number,
        status,
        customer_whatsapp,
        customer_name,
        customer_note,
        requested_seller_name,
        created_at,
        public_token,
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

    for (const raw of orders ?? []) {
      const o = raw as {
        id: string;
        display_number?: number | null;
        status: string;
        customer_whatsapp: string;
        customer_name: string | null;
        customer_note: string | null;
        requested_seller_name: string | null;
        created_at: string;
        public_token: string | null;
        order_items?: OrderItemRow[] | null;
      };

      const wa = normalizeWa(o.customer_whatsapp);
      if (wa.length < 10 || registeredWa.has(wa)) continue;

      const items = o.order_items ?? [];
      const totalPieces = items.reduce((sum, it) => sum + (it.quantity ?? 0), 0);
      const dn = Number(o.display_number);

      carts.push({
        order_id: o.id,
        display_number:
          Number.isFinite(dn) && dn > 0 ? dn : null,
        status: o.status as AbandonedOrderRow["status"],
        customer_whatsapp: wa,
        customer_name: o.customer_name,
        customer_note: o.customer_note,
        requested_seller_name: o.requested_seller_name,
        created_at: o.created_at,
        public_token: o.public_token,
        order_items: items,
        total_pieces: totalPieces,
      });
    }

    return NextResponse.json({ orders: carts, total: carts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
