import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  ALL_BRAZIL_UFS,
  BRAZIL_UF_LABELS,
  type BrazilUf,
  ufFromWhatsapp,
} from "@/lib/brazil-ddd";
import type { BusinessProfile, CrmClientProfileRow } from "@/lib/client-follow-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

export type StateClientBreakdown = {
  uf: BrazilUf;
  name: string;
  total: number;
  lojista: number;
  revendedor: number;
  uso_proprio: number;
  sem_perfil: number;
  desconhecido: number;
};

export type TopSalesState = {
  uf: BrazilUf;
  name: string;
  revenue: number;
  order_count: number;
};

function emptyBreakdown(uf: BrazilUf): StateClientBreakdown {
  return {
    uf,
    name: BRAZIL_UF_LABELS[uf],
    total: 0,
    lojista: 0,
    revendedor: 0,
    uso_proprio: 0,
    sem_perfil: 0,
    desconhecido: 0,
  };
}

function isValidProfile(v: string | null | undefined): v is BusinessProfile {
  return v === "lojista" || v === "revendedor" || v === "uso_proprio";
}

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

/**
 * GET /api/admin/clients/map — distribuição de clientes por UF (DDD) e top 3 vendas (30 dias).
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
    const isOwnerPrincipal =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");
    const rawSellerScope =
      request.nextUrl.searchParams.get("sellerScope")?.trim() ?? "all";

    const admin = createAdminClient();

    let orderQuery = admin
      .from("orders")
      .select(
        "customer_whatsapp, sale_amount, confirmed_at, confirmed_by_staff_id"
      )
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    if (sellerId) {
      orderQuery = orderQuery.eq("confirmed_by_staff_id", sellerId);
    } else if (isOwnerPrincipal && rawSellerScope && rawSellerScope !== "all") {
      const ownerStaffId = await resolveOwnerStaffId(admin, principal);
      if (rawSellerScope === "me") {
        if (ownerStaffId) {
          orderQuery = orderQuery.or(
            `confirmed_by_staff_id.eq.${ownerStaffId},confirmed_by_staff_id.is.null`
          );
        }
      } else if (STAFF_UUID_RE.test(rawSellerScope)) {
        orderQuery = orderQuery.eq("confirmed_by_staff_id", rawSellerScope);
      }
    }

    const { data: orders, error } = await orderQuery;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: hiddenRows, error: hErr } = await admin
      .from("crm_hidden_contacts")
      .select("whatsapp_digits");

    let hiddenSet = new Set<string>();
    if (!hErr) {
      hiddenSet = new Set(
        (hiddenRows ?? []).map((r: { whatsapp_digits: string }) =>
          String(r.whatsapp_digits ?? "").replace(/\D/g, "")
        )
      );
    }

    const waKeys = new Set<string>();
    for (const o of orders ?? []) {
      const wa = String(
        (o as { customer_whatsapp: string }).customer_whatsapp ?? ""
      ).replace(/\D/g, "");
      if (wa.length >= 10 && !hiddenSet.has(wa)) waKeys.add(wa);
    }

    const profileMap = new Map<string, BusinessProfile | null>();
    if (waKeys.size > 0) {
      const { data: profileRows, error: pErr } = await admin
        .from("crm_client_profiles")
        .select("whatsapp_digits, business_profile")
        .in("whatsapp_digits", Array.from(waKeys));
      if (!pErr) {
        for (const raw of profileRows ?? []) {
          const p = raw as CrmClientProfileRow;
          profileMap.set(
            p.whatsapp_digits,
            isValidProfile(p.business_profile) ? p.business_profile : null
          );
        }
      }
    }

    const byWa = new Map<string, { profile: BusinessProfile | null }>();
    for (const o of orders ?? []) {
      const row = o as {
        customer_whatsapp: string;
        sale_amount: number | null;
        confirmed_at: string | null;
      };
      const wa = String(row.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length < 10 || hiddenSet.has(wa)) continue;
      if (!byWa.has(wa)) {
        byWa.set(wa, { profile: profileMap.get(wa) ?? null });
      }
    }

    const stateMap = new Map<BrazilUf, StateClientBreakdown>();
    for (const uf of ALL_BRAZIL_UFS) {
      stateMap.set(uf, emptyBreakdown(uf));
    }

    let clientsWithoutUf = 0;
    for (const [wa, meta] of Array.from(byWa.entries())) {
      const uf = ufFromWhatsapp(wa);
      if (!uf) {
        clientsWithoutUf += 1;
        continue;
      }
      const row = stateMap.get(uf)!;
      row.total += 1;
      const p = meta.profile;
      if (p === "lojista") row.lojista += 1;
      else if (p === "revendedor") row.revendedor += 1;
      else if (p === "uso_proprio") row.uso_proprio += 1;
      else if (!p) row.sem_perfil += 1;
      else row.desconhecido += 1;
    }

    const sinceIso = new Date(Date.now() - MS_30_DAYS).toISOString();
    const salesByUf = new Map<
      BrazilUf,
      { revenue: number; order_count: number }
    >();

    for (const o of orders ?? []) {
      const row = o as {
        customer_whatsapp: string;
        sale_amount: number | null;
        confirmed_at: string | null;
      };
      const confirmed = row.confirmed_at;
      if (!confirmed || confirmed < sinceIso) continue;

      const wa = String(row.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length < 10 || hiddenSet.has(wa)) continue;

      const uf = ufFromWhatsapp(wa);
      if (!uf) continue;

      const spent = Number(row.sale_amount ?? 0);
      const cur = salesByUf.get(uf) ?? { revenue: 0, order_count: 0 };
      cur.order_count += 1;
      if (!Number.isNaN(spent)) cur.revenue += spent;
      salesByUf.set(uf, cur);
    }

    const topSalesStates: TopSalesState[] = Array.from(salesByUf.entries())
      .map(([uf, agg]) => ({
        uf,
        name: BRAZIL_UF_LABELS[uf],
        revenue: agg.revenue,
        order_count: agg.order_count,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);

    const states = Array.from(stateMap.values()).sort((a, b) => b.total - a.total);
    const maxClients = Math.max(1, ...states.map((s) => s.total));

    return NextResponse.json({
      states,
      topSalesStates,
      maxClients,
      clientsWithoutUf,
      totalClients: byWa.size,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
