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
import {
  isVarejoDrivePending,
  parseVarejoDriveSync,
  varejoDriveFailureSummary,
} from "@/lib/varejo-drive-sync";
import type { OrderItemRow, OrderRow } from "@/types";

export const runtime = "nodejs";

const ORDER_SELECT =
  "id, status, sales_channel, checkout_channel, customer_name, customer_whatsapp, customer_note, sale_amount, sale_amount_by_category, shipping_cost, shipping_service, shipping_address, varejo_fulfillment_status, display_number, confirmed_at, created_at, updated_at, mp_payment_id";

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

  const enriched = withDisplay.map((o) => {
    const driveSync = parseVarejoDriveSync(o.sale_amount_by_category);
    const drivePending = isVarejoDrivePending(o.sale_amount_by_category);
    return {
      ...o,
      order_items: itemsByOrder.get(o.id) ?? [],
      varejo_fulfillment_status:
        o.varejo_fulfillment_status === "SEPARADO" ||
        o.varejo_fulfillment_status === "DESPACHADO"
          ? o.varejo_fulfillment_status
          : "EM_ABERTO",
      varejo_drive_pending: drivePending,
      varejo_drive_warning: drivePending
        ? varejoDriveFailureSummary(driveSync)
        : null,
    };
  });

  return NextResponse.json({ orders: enriched });
}

const FULFILLMENT_STATUSES = new Set(["EM_ABERTO", "SEPARADO", "DESPACHADO"]);

/**
 * PATCH /api/admin/varejo-orders
 * Body: { orderId, varejo_fulfillment_status }
 */
export async function PATCH(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não autorizado" },
      { status }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    const orderId = String(
      (body as { orderId?: unknown })?.orderId ?? ""
    ).trim();
    const statusRaw = String(
      (body as { varejo_fulfillment_status?: unknown })
        ?.varejo_fulfillment_status ?? ""
    ).trim();

    if (!orderId) {
      return NextResponse.json({ error: "Informe orderId" }, { status: 400 });
    }
    if (!FULFILLMENT_STATUSES.has(statusRaw)) {
      return NextResponse.json(
        { error: "Status inválido. Use EM_ABERTO, SEPARADO ou DESPACHADO." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .update({ varejo_fulfillment_status: statusRaw })
      .eq("id", orderId)
      .eq("sales_channel", "VAREJO")
      .select("id, varejo_fulfillment_status")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Pedido varejo não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      orderId: data.id,
      varejo_fulfillment_status: data.varejo_fulfillment_status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
