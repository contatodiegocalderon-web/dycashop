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

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PeriodKey =
  | "today"
  | "yesterday"
  | "weekly"
  | "monthly"
  | "yearly"
  | "last30"
  | "all"
  | "selectedDate";

function periodStartIso(period: PeriodKey): string | null {
  const now = new Date();
  const d = new Date(now);
  if (period === "all") return null;
  if (period === "today") {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "yesterday") {
    d.setDate(d.getDate() - 1);
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

function parseSelectedDateUtcRange(
  raw: string | null,
  tzOffsetMinutesRaw: string | null
): { startIso: string; endIso: string } | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [yRaw, mRaw, dRaw] = raw.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const tzOffsetMinutes = Number(tzOffsetMinutesRaw ?? "0");
  if (!Number.isFinite(tzOffsetMinutes)) return null;
  // Converte o "dia local" selecionado no browser para janela UTC exata [início, fim).
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
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

function normalizeNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
    const rawSellerScope = searchParams.get("sellerScope")?.trim() ?? "";
    const rawPeriod = searchParams.get("period");
    const period: PeriodKey =
      rawPeriod === "today" ||
      rawPeriod === "daily" ||
      rawPeriod === "yesterday" ||
      rawPeriod === "weekly" ||
      rawPeriod === "monthly" ||
      rawPeriod === "yearly" ||
      rawPeriod === "last30" ||
      rawPeriod === "selectedDate"
        ? rawPeriod === "daily"
          ? "today"
          : rawPeriod
        : "all";
    const startIso = periodStartIso(period);
    const selectedDateRange =
      period === "selectedDate"
        ? parseSelectedDateUtcRange(
            searchParams.get("selectedDate"),
            searchParams.get("tzOffsetMinutes")
          )
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
      .select(
        "id, sale_amount, sale_amount_by_category, customer_segment, confirmed_by_staff_id, requested_seller_name, confirmed_at"
      )
      .eq("status", "PAGO")
      .not("sale_amount", "is", null);

    if (sellerId) {
      orderQuery = orderQuery.eq("confirmed_by_staff_id", sellerId);
    } else if (isOwner && rawSellerScope && rawSellerScope !== "all") {
      if (rawSellerScope === "me") {
        let ownerStaffId: string | null =
          principal?.kind === "staff" && principal.staff.role === "owner"
            ? principal.staff.staffId
            : null;
        if (!ownerStaffId && principal?.kind === "api_key") {
          const { data: ownerRow } = await admin
            .from("staff_users")
            .select("id")
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();
          ownerStaffId = (ownerRow?.id as string | undefined) ?? null;
        }
        if (ownerStaffId) {
          orderQuery = orderQuery.or(
            `confirmed_by_staff_id.eq.${ownerStaffId},confirmed_by_staff_id.is.null`
          );
        }
      } else if (STAFF_UUID_RE.test(rawSellerScope)) {
        orderQuery = orderQuery.eq("confirmed_by_staff_id", rawSellerScope);
      }
    }
    if (selectedDateRange) {
      orderQuery = orderQuery
        .gte("confirmed_at", selectedDateRange.startIso)
        .lt("confirmed_at", selectedDateRange.endIso);
    } else if (period === "yesterday") {
      const end = new Date(startIso!);
      end.setDate(end.getDate() + 1);
      orderQuery = orderQuery
        .gte("confirmed_at", startIso!)
        .lt("confirmed_at", end.toISOString());
    } else if (startIso) {
      orderQuery = orderQuery.gte("confirmed_at", startIso);
    }

    const { data: orders, error: oErr } = await orderQuery;

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }

    const orderRows = (orders ?? []) as (OrderSaleRow & {
      confirmed_by_staff_id?: string | null;
      requested_seller_name?: string | null;
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
      let ownerName = "Dono";
      const { data: ownerRow } = await admin
        .from("staff_users")
        .select("email, full_name")
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();
      if (ownerRow) {
        ownerName =
          String(ownerRow.full_name ?? "").trim() ||
          nameFromEmail(String(ownerRow.email ?? "")) ||
          ownerName;
      }
      if (staffIds.length > 0 || orderRows.length > 0) {
        const staffRows =
          staffIds.length > 0
            ? (
                await admin
                  .from("staff_users")
                  .select("id, email, full_name")
                  .in("id", staffIds)
              ).data ?? []
            : [];
        const staffMap = new Map(
          staffRows.map((s) => [
            s.id as string,
            {
              email: String(s.email ?? ""),
              name: String(s.full_name ?? "").trim() || nameFromEmail(String(s.email ?? "")),
            },
          ])
        );
        const buckets = new Map<
          string,
          {
            name: string;
            email: string;
            orders: typeof orderRows;
          }
        >();
        for (const o of orderRows) {
          const st = o.confirmed_by_staff_id
            ? staffMap.get(o.confirmed_by_staff_id)
            : null;
          const displayName =
            st?.name ||
            o.requested_seller_name?.trim() ||
            ownerName;
          const displayEmail = st?.email ?? "";
          const key = normalizeNameKey(displayName);
          const bucket = buckets.get(key) ?? {
            name: displayName,
            email: displayEmail,
            orders: [],
          };
          bucket.orders.push(o);
          buckets.set(key, bucket);
        }

        for (const [bucketKey, bucket] of Array.from(buckets.entries())) {
          const sellerOrders = bucket.orders;
          const sellerItemsByOrder = new Map<string, OrderItemSaleRow[]>();
          for (const o of sellerOrders) {
            const list = itemsByOrderId.get(o.id) ?? [];
            sellerItemsByOrder.set(o.id, list);
          }
          const sellerMetrics = aggregateSalesMetrics(sellerOrders, sellerItemsByOrder, costs);
          sellerBreakdown.push({
            staffId: bucketKey,
            staffName: bucket.name,
            staffEmail: bucket.email,
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
