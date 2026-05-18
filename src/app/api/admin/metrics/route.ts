import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  confirmedAtFilterForPeriod,
  describeConfirmedAtFilter,
  parseAdminPeriodKey,
  parseTzOffsetMinutes,
} from "@/lib/admin-period";
import {
  applyConfirmedAtFilterToOrdersQuery,
  fetchAllPaidOrdersWithSale,
  fetchOrderItemsByOrderIds,
  type OrdersListQuery,
} from "@/lib/admin-orders-query";
import {
  aggregateSalesMetrics,
  type OrderItemSaleRow,
  type OrderSaleRow,
} from "@/lib/sales-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const period = parseAdminPeriodKey(searchParams.get("period"));
    const tzOffsetMinutes = parseTzOffsetMinutes(
      searchParams.get("tzOffsetMinutes")
    );
    const dateFilter = confirmedAtFilterForPeriod(period, {
      selectedDate: searchParams.get("selectedDate"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      tzOffsetMinutes,
    });
    const periodDescription = describeConfirmedAtFilter(
      period,
      dateFilter,
      tzOffsetMinutes
    );

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

    let ownerStaffIdForScope: string | null = null;
    if (
      isOwner &&
      rawSellerScope === "me" &&
      !sellerId
    ) {
      ownerStaffIdForScope =
        principal?.kind === "staff" && principal.staff.role === "owner"
          ? principal.staff.staffId
          : null;
      if (!ownerStaffIdForScope && principal?.kind === "api_key") {
        const { data: ownerRow } = await admin
          .from("staff_users")
          .select("id")
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        ownerStaffIdForScope = (ownerRow?.id as string | undefined) ?? null;
      }
    }

    const orderRows = await fetchAllPaidOrdersWithSale(admin, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = admin
        .from("orders")
        .select(
          "id, sale_amount, sale_amount_by_category, customer_segment, confirmed_by_staff_id, requested_seller_name, confirmed_at"
        )
        .eq("status", "PAGO")
        .not("sale_amount", "is", null)
        .gt("sale_amount", 0);

      if (sellerId) {
        q = q.eq("confirmed_by_staff_id", sellerId);
      } else if (isOwner && rawSellerScope && rawSellerScope !== "all") {
        if (rawSellerScope === "me" && ownerStaffIdForScope) {
          q = q.or(
            `confirmed_by_staff_id.eq.${ownerStaffIdForScope},confirmed_by_staff_id.is.null`
          );
        } else if (STAFF_UUID_RE.test(rawSellerScope)) {
          q = q.eq("confirmed_by_staff_id", rawSellerScope);
        }
      }

      return applyConfirmedAtFilterToOrdersQuery(
        q,
        dateFilter
      ) as unknown as OrdersListQuery;
    });

    if (orderRows.length === 0) {
      const empty = aggregateSalesMetrics([], new Map(), costs);
      return NextResponse.json(
        {
          metrics: empty,
          costs,
          period,
          periodDescription,
          viewerRole: isOwner ? "owner" : "seller",
          sellerBreakdown: [],
          meta: { ordersIncluded: 0, ordersWithSale: 0, totalPieces: 0 },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const orderIds = orderRows.map((o) => o.id);
    const itemsByOrderId = await fetchOrderItemsByOrderIds(admin, orderIds);

    const metrics = aggregateSalesMetrics(
      orderRows as OrderSaleRow[],
      itemsByOrderId as Map<string, OrderItemSaleRow[]>,
      costs
    );

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
            sellerItemsByOrder.set(o.id, list as OrderItemSaleRow[]);
          }
          const sellerMetrics = aggregateSalesMetrics(
            sellerOrders as OrderSaleRow[],
            sellerItemsByOrder,
            costs
          );
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

    const ordersWithSale = orderRows.filter(
      (o) => o.sale_amount != null && Number(o.sale_amount) > 0
    ).length;
    const totalPieces = Object.values(metrics.piecesByCategory).reduce(
      (s, n) => s + n,
      0
    );

    return NextResponse.json(
      {
        metrics,
        costs,
        period,
        periodDescription,
        viewerRole: isOwner ? "owner" : "seller",
        sellerBreakdown,
        meta: {
          ordersIncluded: orderRows.length,
          ordersWithSale,
          totalPieces,
          generatedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
