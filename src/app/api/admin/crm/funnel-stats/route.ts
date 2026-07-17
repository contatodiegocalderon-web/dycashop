import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { applyCrmSellerOrderScope } from "@/lib/crm-seller-order-filter";
import { applyPendingOrdersSellerScope } from "@/lib/crm-pending-seller-filter";
import { clientRecencyStatus } from "@/lib/client-recency";
import { excludeCrmRemarketingFromOrdersQuery } from "@/lib/crm-legacy-import";
import {
  fetchAllCrmPaidOrders,
  type CrmPaidOrdersListQuery,
} from "@/lib/admin-orders-query";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

async function resolveOwnerStaffId(
  admin: ReturnType<typeof createAdminClient>,
  principal: Awaited<ReturnType<typeof resolvePrincipal>>
): Promise<string | null> {
  if (principal?.kind === "staff" && principal.staff.role === "owner") {
    return principal.staff.staffId;
  }
  if (principal?.kind === "api_key") {
    const { data: ownerRow } = await admin
      .from("staff_users")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    return (ownerRow?.id as string | undefined) ?? null;
  }
  return null;
}

/** GET /api/admin/crm/funnel-stats — contagens por etapa do funil. */
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
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;
    const isOwnerPrincipal =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");
    const rawSellerScope =
      request.nextUrl.searchParams.get("sellerScope")?.trim() ?? "all";
    const ownerStaffId = await resolveOwnerStaffId(admin, principal);

    const { data: paidWaRows } = await admin
      .from("orders")
      .select("customer_whatsapp")
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    const paidWa = new Set<string>();
    for (const row of paidWaRows ?? []) {
      const wa = normalizeWhatsappDigits(
        (row as { customer_whatsapp: string }).customer_whatsapp
      );
      if (wa.length >= 10) paidWa.add(wa);
    }

    const { data: hiddenRows } = await admin
      .from("crm_hidden_contacts")
      .select("whatsapp_digits");
    const hidden = new Set(
      (hiddenRows ?? []).map((r: { whatsapp_digits: string }) =>
        normalizeWhatsappDigits(r.whatsapp_digits)
      )
    );

    const { data: abandonRows } = await admin
      .from("orders")
      .select("customer_whatsapp")
      .in("status", ["PENDENTE_PAGAMENTO", "CANCELADO"])
      .not("customer_whatsapp", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    const abandonWa = new Set<string>();
    for (const row of abandonRows ?? []) {
      const wa = normalizeWhatsappDigits(
        (row as { customer_whatsapp: string }).customer_whatsapp
      );
      if (wa.length < 10 || paidWa.has(wa) || hidden.has(wa)) continue;
      abandonWa.add(wa);
    }
    const abandonados = abandonWa.size;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let openQ: any = admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDENTE_PAGAMENTO")
      .not("customer_whatsapp", "is", null);
    openQ = excludeCrmRemarketingFromOrdersQuery(openQ);
    openQ = await applyPendingOrdersSellerScope(admin, openQ, {
      principal,
      rawSellerScope,
    });
    const { count: em_aberto } = await openQ;

    const orderRows = await fetchAllCrmPaidOrders(admin, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = admin
        .from("orders")
        .select("customer_whatsapp, confirmed_at")
        .eq("status", "PAGO")
        .not("customer_whatsapp", "is", null);

      q = applyCrmSellerOrderScope(q, {
        sellerId,
        isOwnerPrincipal,
        rawSellerScope,
        ownerStaffId,
      });

      return q as CrmPaidOrdersListQuery;
    });

    const byWa = new Map<string, string>();
    for (const o of orderRows) {
      const wa = normalizeWhatsappDigits(o.customer_whatsapp);
      if (wa.length < 12 || hidden.has(wa)) continue;
      const t = o.confirmed_at;
      if (!t) continue;
      const cur = byWa.get(wa);
      if (!cur || t > cur) byWa.set(wa, t);
    }

    let pos_30 = 0;
    let pos_30_59 = 0;
    let pos_60 = 0;
    for (const lastAt of Array.from(byWa.values())) {
      const st = clientRecencyStatus(lastAt);
      if (st === "green") pos_30 += 1;
      else if (st === "yellow") pos_30_59 += 1;
      else if (st === "red") pos_60 += 1;
    }

    return NextResponse.json({
      abandonados,
      em_aberto: em_aberto ?? 0,
      pos_30,
      pos_30_59,
      pos_60,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
