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

type PeriodKey = "daily" | "weekly" | "monthly" | "yearly" | "last30" | "all";

function periodStartIso(period: PeriodKey): string | null {
  const now = new Date();
  const d = new Date(now);
  if (period === "all") return null;
  if (period === "daily") {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "weekly") {
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "monthly") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "yearly") {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function nameFromEmail(email: string): string {
  const base = email.split("@")[0] ?? email;
  const clean = base.replace(/[._-]+/g, " ").trim();
  if (!clean) return email;
  return clean
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

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
    const isOwner =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;
    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get("period");
    const period: PeriodKey =
      rawPeriod === "daily" ||
      rawPeriod === "weekly" ||
      rawPeriod === "monthly" ||
      rawPeriod === "yearly" ||
      rawPeriod === "last30"
        ? rawPeriod
        : "all";
    const startIso = periodStartIso(period);

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
      .select("id, sale_amount, customer_segment, confirmed_by_staff_id, confirmed_at")
      .eq("status", "PAGO")
      .not("sale_amount", "is", null);

    if (sellerId) {
      orderQuery = orderQuery.eq("confirmed_by_staff_id", sellerId);
    }
    if (startIso) {
      orderQuery = orderQuery.gte("confirmed_at", startIso);
    }

    const { data: orders, error: oErr } = await orderQuery;

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }

    const orderRows = (orders ?? []) as (OrderSaleRow & {
      confirmed_by_staff_id?: string | null;
      confirmed_at?: string | null;
    })[];
    const orderIds = orderRows.map((o) => o.id);
    if (orderIds.length === 0) {
      const empty = aggregateSalesMetrics([], new Map(), costs);
      return NextResponse.json({
        metrics: empty,
        costs,
        period,
        viewerRole: isOwner ? "owner" : "seller",
        sellerBreakdown: [],
      });
    }

    const { data: items, error: iErr } = await admin
      .from("order_items")
      .select(
        "order_id, quantity, snapshot_category, snapshot_brand, snapshot_color, snapshot_size, products(category)"
      )
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
    const sellerBreakdown: Array<{
      staffId: string;
      staffName: string;
      staffEmail: string;
      orderCount: number;
      totalRevenue: number;
      totalProfit: number;
      topProduct: string | null;
      topProductPieces: number;
    }> = [];

    if (isOwner) {
      const staffIds = Array.from(
        new Set(orderRows.map((o) => o.confirmed_by_staff_id).filter(Boolean))
      ) as string[];
      if (staffIds.length > 0) {
        const { data: staffRows } = await admin
          .from("staff_users")
          .select("id, email, full_name")
          .in("id", staffIds);
        const staffMap = new Map(
          (staffRows ?? []).map((s) => [
            s.id as string,
            {
              email: String(s.email ?? ""),
              name: String(s.full_name ?? "").trim() || nameFromEmail(String(s.email ?? "")),
            },
          ])
        );
        for (const staffId of staffIds) {
          const sellerOrders = orderRows.filter((o) => o.confirmed_by_staff_id === staffId);
          const sellerItemsByOrder = new Map<string, OrderItemSaleRow[]>();
          for (const o of sellerOrders) {
            const list = itemsByOrderId.get(o.id) ?? [];
            sellerItemsByOrder.set(o.id, list);
          }
          const sellerMetrics = aggregateSalesMetrics(sellerOrders, sellerItemsByOrder, costs);
          const st = staffMap.get(staffId);
          sellerBreakdown.push({
            staffId,
            staffName: st?.name ?? "Vendedor",
            staffEmail: st?.email ?? "",
            orderCount: sellerMetrics.orderCount,
            totalRevenue: sellerMetrics.totalRevenue,
            totalProfit: sellerMetrics.totalProfit,
            topProduct: sellerMetrics.topCategoryByPieces,
            topProductPieces:
              sellerMetrics.topCategoryByPieces != null
                ? (sellerMetrics.piecesByCategory[sellerMetrics.topCategoryByPieces] ?? 0)
                : 0,
          });
        }
      }
    }

    return NextResponse.json({
      metrics,
      costs,
      period,
      viewerRole: isOwner ? "owner" : "seller",
      sellerBreakdown,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
