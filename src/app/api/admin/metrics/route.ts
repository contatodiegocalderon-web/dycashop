import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  aggregateSalesMetrics,
  type OrderItemSaleRow,
  type OrderSaleRow,
} from "@/lib/sales-metrics";

export const runtime = "nodejs";

/**
 * GET /api/admin/metrics — métricas de vendas (pedidos PAGO com valor registrado).
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
    const principal = await resolvePrincipal(request);
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;

    const admin = createAdminClient();

    const { data: costRows, error: cErr } = await admin
      .from("category_cost_defaults")
      .select("category_label, cost_per_piece");

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    const costs: Record<string, number> = {};
    for (const r of costRows ?? []) {
      costs[r.category_label] = Number(r.cost_per_piece);
    }

    let orderQuery = admin
      .from("orders")
      .select("id, sale_amount, customer_segment")
      .eq("status", "PAGO");

    if (sellerId) {
      orderQuery = orderQuery.eq("confirmed_by_staff_id", sellerId);
    }

    const { data: orders, error: oErr } = await orderQuery;

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }

    const orderRows = (orders ?? []) as OrderSaleRow[];
    const orderIds = orderRows.map((o) => o.id);
    if (orderIds.length === 0) {
      const empty = aggregateSalesMetrics([], new Map(), costs);
      return NextResponse.json({ metrics: empty, costs });
    }

    const { data: items, error: iErr } = await admin
      .from("order_items")
      .select("order_id, quantity, snapshot_category, products(category)")
      .in("order_id", orderIds);

    if (iErr) {
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }

    const itemsByOrderId = new Map<string, OrderItemSaleRow[]>();
    for (const row of items ?? []) {
      const it = row as unknown as OrderItemSaleRow;
      const list = itemsByOrderId.get(it.order_id) ?? [];
      list.push(it);
      itemsByOrderId.set(it.order_id, list);
    }

    const metrics = aggregateSalesMetrics(orderRows, itemsByOrderId, costs);

    return NextResponse.json({ metrics, costs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
