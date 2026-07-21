import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { fetchCrmProfilesByWhatsapp } from "@/lib/admin-orders-query";
import {
  CRM_ABANDONED_FOLLOW_UP_MAX,
  matchesProfileFilter,
  sortLeadsRepeatBuyersFirst,
  totalPiecesFromItems,
  volumeTierFromPieces,
  type CrmProfileFilter,
} from "@/lib/crm-funnel";
import { applyPendingOrdersSellerScope } from "@/lib/crm-pending-seller-filter";
import {
  cancelledOrderQualifiesForAbandoned,
  hasOpenOrderFlag,
  loadLastPaidAtByWhatsapp,
  loadOpenOrderWhatsappLookup,
} from "@/lib/crm-abandoned-query";
import {
  normalizeWhatsappDigits,
  whatsappMatchesLookup,
  buildWhatsappLookup,
  lookupWhatsappMapValue,
  expandWhatsappQueryKeys,
  whatsappDedupeKeys,
} from "@/lib/whatsapp-normalize";
import type { BusinessProfile } from "@/lib/client-follow-up";
import type { OrderItemRow } from "@/types";

export const runtime = "nodejs";

export type AbandonedOrderRow = {
  order_id: string;
  customer_whatsapp: string;
  customer_name: string | null;
  requested_seller_name: string | null;
  created_at: string;
  order_items: OrderItemRow[];
  total_pieces: number;
  volume_tier: "atacado" | "varejo";
  whatsapp_click_count: number;
  follow_up_count: number;
  follow_up_remaining: number;
  business_profile: BusinessProfile | null;
  has_paid_before: boolean;
  /** Pedidos cancelados válidos após última compra (ou sem compra). */
  cancelled_order_count: number;
  /** Cliente também tem pedido PENDENTE na etapa 2. */
  has_open_order: boolean;
};

type RawCancelledOrder = {
  id: string;
  customer_whatsapp: string;
  customer_name: string | null;
  requested_seller_name: string | null;
  created_at: string;
  order_items?: OrderItemRow[] | null;
};

async function loadHiddenWa(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("crm_hidden_contacts")
    .select("whatsapp_digits");
  if (error) {
    const missing = /does not exist|schema cache|relation/i.test(error.message);
    if (missing) return new Set<string>();
    throw new Error(error.message);
  }
  return new Set(
    (data ?? []).map((r: { whatsapp_digits: string }) =>
      normalizeWhatsappDigits(r.whatsapp_digits)
    )
  );
}

/**
 * Pedidos cancelados no sistema — um card por lead.
 * Só entram cancelamentos após a última compra confirmada; histórico zera ao confirmar.
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
    const principal = await resolvePrincipal(request);
    const rawSellerScope =
      request.nextUrl.searchParams.get("sellerScope")?.trim() ?? "all";
    const profileFilter = (request.nextUrl.searchParams.get("profile")?.trim() ??
      "all") as CrmProfileFilter;

    const { data: paidRows, error: paidErr } = await admin
      .from("orders")
      .select("customer_whatsapp")
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    if (paidErr) {
      return NextResponse.json({ error: paidErr.message }, { status: 500 });
    }

    const registeredWa = buildWhatsappLookup(
      (paidRows ?? []) as Array<{ customer_whatsapp: string }>
    );

    const hiddenSet = await loadHiddenWa(admin);
    const openOrderLookup = await loadOpenOrderWhatsappLookup(admin);
    const lastPaidAtByWa = await loadLastPaidAtByWhatsapp(admin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = admin
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
      .eq("status", "CANCELADO")
      .not("customer_whatsapp", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    q = await applyPendingOrdersSellerScope(admin, q, {
      principal,
      rawSellerScope,
    });

    const { data: orders, error: oErr } = await q;

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }

    const grouped = new Map<
      string,
      { latest: RawCancelledOrder; count: number }
    >();

    for (const raw of orders ?? []) {
      const o = raw as RawCancelledOrder;
      const wa = normalizeWhatsappDigits(o.customer_whatsapp);
      if (wa.length < 10 || hiddenSet.has(wa)) continue;
      if (
        !cancelledOrderQualifiesForAbandoned(
          o.created_at,
          wa,
          lastPaidAtByWa
        )
      ) {
        continue;
      }

      const cur = grouped.get(wa);
      if (!cur) {
        grouped.set(wa, { latest: o, count: 1 });
      } else {
        cur.count += 1;
        if (o.created_at > cur.latest.created_at) {
          cur.latest = o;
        }
      }
    }

    const waForProfile = Array.from(grouped.keys());
    const profileMap = await fetchCrmProfilesByWhatsapp(
      admin,
      expandWhatsappQueryKeys(waForProfile)
    );

    const carts: AbandonedOrderRow[] = [];
    const waForMeta = new Set<string>();

    for (const [wa, { latest, count }] of Array.from(grouped.entries())) {
      const business_profile =
        (lookupWhatsappMapValue(wa, profileMap)?.business_profile as
          | BusinessProfile
          | null) ?? null;

      if (!matchesProfileFilter(business_profile, profileFilter)) continue;

      const items = latest.order_items ?? [];
      const total_pieces = totalPiecesFromItems(items);
      const has_paid_before =
        whatsappMatchesLookup(wa, registeredWa) || !!business_profile;

      waForMeta.add(wa);
      carts.push({
        order_id: latest.id,
        customer_whatsapp: wa,
        customer_name: latest.customer_name,
        requested_seller_name: latest.requested_seller_name,
        created_at: latest.created_at,
        order_items: items,
        total_pieces,
        volume_tier: volumeTierFromPieces(total_pieces),
        whatsapp_click_count: 0,
        follow_up_count: 0,
        follow_up_remaining: CRM_ABANDONED_FOLLOW_UP_MAX,
        business_profile,
        has_paid_before,
        cancelled_order_count: count,
        has_open_order: hasOpenOrderFlag(wa, openOrderLookup),
      });
    }

    const clickMap = new Map<string, number>();
    const followMap = new Map<string, number>();

    if (waForMeta.size > 0) {
      const waList = expandWhatsappQueryKeys(Array.from(waForMeta));
      const { data: clickRows } = await admin
        .from("crm_abandoned_whatsapp_clicks")
        .select("whatsapp_digits, click_count")
        .in("whatsapp_digits", waList);
      for (const row of clickRows ?? []) {
        const r = row as { whatsapp_digits: string; click_count: number };
        const count = Number(r.click_count) || 0;
        for (const key of whatsappDedupeKeys(r.whatsapp_digits)) {
          clickMap.set(key, count);
        }
      }

      const { data: followRows } = await admin
        .from("crm_abandoned_follow_ups")
        .select("whatsapp_digits, follow_up_count")
        .in("whatsapp_digits", waList);
      for (const row of followRows ?? []) {
        const r = row as { whatsapp_digits: string; follow_up_count: number };
        const count = Number(r.follow_up_count) || 0;
        for (const key of whatsappDedupeKeys(r.whatsapp_digits)) {
          followMap.set(key, count);
        }
      }
    }

    for (const cart of carts) {
      cart.whatsapp_click_count = clickMap.get(cart.customer_whatsapp) ?? 0;
      cart.follow_up_count = followMap.get(cart.customer_whatsapp) ?? 0;
      cart.follow_up_remaining = Math.max(
        0,
        CRM_ABANDONED_FOLLOW_UP_MAX - cart.follow_up_count
      );
    }

    const sorted = sortLeadsRepeatBuyersFirst(carts);

    const atacado = sorted.filter((c) => c.volume_tier === "atacado").length;
    const varejo = sorted.filter((c) => c.volume_tier === "varejo").length;

    return NextResponse.json({
      orders: sorted,
      total: sorted.length,
      counts: { atacado, varejo },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
