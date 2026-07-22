import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-auth";
import {
  confirmedAtFilterForPeriod,
  parseAdminPeriodKey,
  parseTzOffsetMinutes,
} from "@/lib/admin-period";
import { applyConfirmedAtFilterToOrdersQuery } from "@/lib/admin-orders-query";
import { attachDisplayNumbers, fetchAllOrderIdsNewestFirst } from "@/lib/order-display-number";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderItemRow, OrderRow } from "@/types";

export const runtime = "nodejs";

const ORDER_SELECT =
  "id, status, sales_channel, checkout_channel, customer_name, customer_whatsapp, sale_amount, shipping_cost, confirmed_at, created_at, updated_at, mp_payment_id";

export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não autorizado" },
      { status }
    );
  }

  const url = new URL(request.url);
  const period = parseAdminPeriodKey(url.searchParams.get("period"));
  const tzOffsetMinutes = parseTzOffsetMinutes(
    url.searchParams.get("tzOffsetMinutes")
  );
  const dateFrom = url.searchParams.get("dateFrom")?.trim() || undefined;
  const dateTo = url.searchParams.get("dateTo")?.trim() || undefined;

  const filter = confirmedAtFilterForPeriod(period, {
    tzOffsetMinutes,
    dateFrom,
    dateTo,
  });

  const admin = createAdminClient();
  let q = admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("status", "PAGO")
    .eq("sales_channel", "VAREJO")
    .order("confirmed_at", { ascending: false, nullsFirst: false });

  q = applyConfirmedAtFilterToOrdersQuery(q, filter);

  const { data: orders, error } = await q.limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (orders ?? []) as OrderRow[];
  if (!rows.length) {
    return NextResponse.json({ orders: [] as OrderRow[] });
  }

  const needsLegacyRank = rows.some((r) => {
    const dn = r.display_number;
    return !(typeof dn === "number" && Number.isFinite(dn) && dn > 0);
  });
  const idsGlobal = needsLegacyRank ? await fetchAllOrderIdsNewestFirst() : [];
  const withDisplay = attachDisplayNumbers(rows, idsGlobal);
  const ids = withDisplay.map((o) => o.id);

  const { data: items, error: iErr } = await admin
    .from("order_items")
    .select("*")
    .in("order_id", ids);

  if (iErr) {
    return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const it of (items ?? []) as OrderItemRow[]) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  const enriched = withDisplay.map((o) => ({
    ...o,
    order_items: itemsByOrder.get(o.id) ?? [],
  }));

  return NextResponse.json({ orders: enriched });
}
