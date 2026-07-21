import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePrincipal } from "@/lib/access";
import { fetchCrmProfilesByWhatsapp } from "@/lib/admin-orders-query";
import { clientRecencyStatus } from "@/lib/client-recency";
import {
  matchesProfileFilter,
  totalPiecesFromItems,
  volumeTierFromPieces,
  type CrmProfileFilter,
} from "@/lib/crm-funnel";
import { applyPendingOrdersSellerScope } from "@/lib/crm-pending-seller-filter";
import { excludeCrmRemarketingFromOrdersQuery } from "@/lib/crm-legacy-import";
import {
  cancelledOrderQualifiesForAbandoned,
  loadLastPaidAtByWhatsapp,
} from "@/lib/crm-abandoned-query";
import { applyCrmSellerOrderScope } from "@/lib/crm-seller-order-filter";
import type { NextRequest } from "next/server";
import type { CrmBotFunnelTab, CrmBotRecipientInput } from "@/lib/crm-bot/types";
import {
  normalizeWhatsappDigits,
  lookupWhatsappMapValue,
} from "@/lib/whatsapp-normalize";

export type LoadRecipientsOpts = {
  request: NextRequest;
  funnelTab: CrmBotFunnelTab;
  volumeTier: "all" | "atacado" | "varejo";
  profileFilter: CrmProfileFilter;
  sellerScope: string;
};

async function resolveOwnerStaffId(
  admin: ReturnType<typeof createAdminClient>,
  principal: Awaited<ReturnType<typeof resolvePrincipal>>
) {
  if (principal?.kind === "staff" && principal.staff.role === "owner") {
    return principal.staff.staffId;
  }
  if (principal?.kind === "api_key") {
    const { data } = await admin
      .from("staff_users")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  return null;
}

export async function loadCampaignRecipients(
  opts: LoadRecipientsOpts
): Promise<CrmBotRecipientInput[]> {
  const admin = createAdminClient();
  const principal = await resolvePrincipal(opts.request);
  const map = new Map<string, CrmBotRecipientInput>();

  function add(wa: string, name: string | null) {
    const d = normalizeWhatsappDigits(wa);
    if (d.length < 10 || map.has(d)) return;
    map.set(d, { customer_whatsapp: d, customer_name: name });
  }

  const profileFilter = opts.profileFilter;

  if (opts.funnelTab === "abandonados" || opts.funnelTab === "em_aberto") {
    const isOpen = opts.funnelTab === "em_aberto";
    const lastPaidAtByWa = isOpen
      ? null
      : await loadLastPaidAtByWhatsapp(admin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = admin
      .from("orders")
      .select(
        "id, customer_whatsapp, customer_name, requested_seller_name, created_at, order_items(quantity)"
      )
      .not("customer_whatsapp", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (isOpen) {
      q = q.eq("status", "PENDENTE_PAGAMENTO");
      q = excludeCrmRemarketingFromOrdersQuery(q);
    } else {
      q = q.eq("status", "CANCELADO");
    }

    q = await applyPendingOrdersSellerScope(admin, q, {
      principal,
      rawSellerScope: opts.sellerScope,
    });

    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);

    const waSet = new Set<string>();
    for (const raw of orders ?? []) {
      const wa = normalizeWhatsappDigits(
        (raw as { customer_whatsapp: string }).customer_whatsapp
      );
      if (wa.length >= 10) waSet.add(wa);
    }
    const profileMap = await fetchCrmProfilesByWhatsapp(admin, Array.from(waSet));

    for (const raw of orders ?? []) {
      const o = raw as {
        customer_whatsapp: string;
        customer_name: string | null;
        created_at: string;
        order_items?: Array<{ quantity: number }> | null;
      };
      const wa = normalizeWhatsappDigits(o.customer_whatsapp);
      if (wa.length < 10) continue;

      if (
        !isOpen &&
        lastPaidAtByWa &&
        !cancelledOrderQualifiesForAbandoned(
          o.created_at,
          wa,
          lastPaidAtByWa
        )
      ) {
        continue;
      }

      const profile =
        (lookupWhatsappMapValue(wa, profileMap)?.business_profile as string | null) ??
        null;
      if (!matchesProfileFilter(profile, profileFilter)) continue;

      const pieces = totalPiecesFromItems(o.order_items ?? []);
      const tier = volumeTierFromPieces(pieces);
      if (opts.volumeTier !== "all" && tier !== opts.volumeTier) continue;

      add(wa, o.customer_name);
    }
  } else {
    const recency =
      opts.funnelTab === "pos_30"
        ? "green"
        : opts.funnelTab === "pos_30_59"
          ? "yellow"
          : "red";

    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;
    const isOwnerPrincipal =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");
    const ownerStaffId = await resolveOwnerStaffId(admin, principal);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = admin
      .from("orders")
      .select(
        "customer_whatsapp, customer_name, confirmed_at, confirmed_by_staff_id, requested_seller_name, legacy_import"
      )
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null)
      .eq("legacy_import", false);

    q = applyCrmSellerOrderScope(q, {
      sellerId,
      isOwnerPrincipal,
      rawSellerScope: opts.sellerScope,
      ownerStaffId,
    });

    const { data: orderRows, error } = await q;
    if (error) throw new Error(error.message);

    const byWa = new Map<
      string,
      { name: string | null; last_at: string | null }
    >();
    for (const o of orderRows ?? []) {
      const row = o as {
        customer_whatsapp: string;
        customer_name: string | null;
        confirmed_at: string | null;
      };
      const wa = normalizeWhatsappDigits(row.customer_whatsapp);
      if (wa.length < 12 || !row.confirmed_at) continue;
      const cur = byWa.get(wa);
      if (!cur || row.confirmed_at > (cur.last_at ?? "")) {
        byWa.set(wa, {
          name: row.customer_name,
          last_at: row.confirmed_at,
        });
      }
    }

    const waList = Array.from(byWa.keys());
    const profileMap = await fetchCrmProfilesByWhatsapp(admin, waList);

    for (const [wa, meta] of Array.from(byWa.entries())) {
      if (clientRecencyStatus(meta.last_at!) !== recency) continue;
      const profile =
        (lookupWhatsappMapValue(wa, profileMap)?.business_profile as string | null) ??
        null;
      if (!matchesProfileFilter(profile, profileFilter)) continue;
      add(wa, meta.name);
    }
  }

  return Array.from(map.values());
}
