import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  fetchCrmProfilesByWhatsapp,
} from "@/lib/admin-orders-query";
import {
  matchesProfileFilter,
  sortLeadsRepeatBuyersFirst,
  totalPiecesFromItems,
  volumeTierFromPieces,
  type CrmProfileFilter,
} from "@/lib/crm-funnel";
import { applyPendingOrdersSellerScope } from "@/lib/crm-pending-seller-filter";
import { excludeCrmRemarketingFromOrdersQuery } from "@/lib/crm-legacy-import";
import { normalizeWhatsappDigits, whatsappMatchesLookup, buildWhatsappLookup, lookupWhatsappMapValue, expandWhatsappQueryKeys } from "@/lib/whatsapp-normalize";
import type { BusinessProfile } from "@/lib/client-follow-up";
import type { OrderItemRow } from "@/types";

export const runtime = "nodejs";

export type OpenOrderRow = {
  order_id: string;
  customer_whatsapp: string;
  customer_name: string | null;
  requested_seller_name: string | null;
  created_at: string;
  order_items: OrderItemRow[];
  total_pieces: number;
  volume_tier: "atacado" | "varejo";
  has_paid_before: boolean;
  business_profile: BusinessProfile | null;
};

/**
 * GET /api/admin/crm/open-orders — pedidos PENDENTE_PAGAMENTO (mesma base da aba Pedidos).
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

    const paidWa = buildWhatsappLookup(
      (paidRows ?? []) as Array<{ customer_whatsapp: string }>
    );

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
          snapshot_category,
          snapshot_brand,
          snapshot_color,
          snapshot_size,
          snapshot_image_url,
          snapshot_drive_file_id,
          snapshot_original_name,
          created_at
        )
      `
      )
      .eq("status", "PENDENTE_PAGAMENTO")
      .not("customer_whatsapp", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    q = excludeCrmRemarketingFromOrdersQuery(q);
    q = await applyPendingOrdersSellerScope(admin, q, {
      principal,
      rawSellerScope,
    });

    const { data: orders, error: oErr } = await q;

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }

    const waSet = new Set<string>();
    for (const raw of orders ?? []) {
      const wa = normalizeWhatsappDigits(
        (raw as { customer_whatsapp: string }).customer_whatsapp
      );
      if (wa.length >= 10) waSet.add(wa);
    }

    const profileMap = await fetchCrmProfilesByWhatsapp(
      admin,
      expandWhatsappQueryKeys(Array.from(waSet))
    );

    const rows: OpenOrderRow[] = [];

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
      if (wa.length < 10) continue;

      const business_profile =
        (lookupWhatsappMapValue(wa, profileMap)?.business_profile as
          | BusinessProfile
          | null) ?? null;

      if (!matchesProfileFilter(business_profile, profileFilter)) continue;

      const items = o.order_items ?? [];
      const total_pieces = totalPiecesFromItems(items);
      const volume_tier = volumeTierFromPieces(total_pieces);

      const hasPaidHistory = whatsappMatchesLookup(wa, paidWa);

      rows.push({
        order_id: o.id,
        customer_whatsapp: wa,
        customer_name: o.customer_name,
        requested_seller_name: o.requested_seller_name,
        created_at: o.created_at,
        order_items: items,
        total_pieces,
        volume_tier,
        has_paid_before: hasPaidHistory || !!business_profile,
        business_profile,
      });
    }

    const sorted = sortLeadsRepeatBuyersFirst(rows);

    const atacado = sorted.filter((r) => r.volume_tier === "atacado").length;
    const varejo = sorted.filter((r) => r.volume_tier === "varejo").length;

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
