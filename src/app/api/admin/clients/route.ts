import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  clientRecencyStatus,
  type ClientRecencyStatus,
} from "@/lib/client-recency";
import type { BusinessProfile, CrmClientProfileRow } from "@/lib/client-follow-up";

export const runtime = "nodejs";

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

type OrderRowForClient = {
  customer_whatsapp: string;
  customer_name: string | null;
  customer_segment: string | null;
  sale_amount: number | null;
  confirmed_at: string | null;
  confirmed_by_staff_id?: string | null;
};

function sellerLabelForOrder(
  o: OrderRowForClient,
  staffMap: Map<string, string>,
  ownerName: string
): string {
  const sid = o.confirmed_by_staff_id;
  if (sid) return staffMap.get(sid) ?? "Vendedor";
  return ownerName;
}

export type AdminClientRow = {
  customer_whatsapp: string;
  customer_name: string | null;
  customer_segment: string | null;
  is_new: boolean;
  order_count: number;
  total_spent: number;
  first_confirmed_at: string | null;
  last_confirmed_at: string | null;
  sellers_label: string;
  business_profile: BusinessProfile | null;
  recency_status: ClientRecencyStatus;
};

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
 * GET /api/admin/clients — clientes com pedido pago e semáforo de recompra.
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
    await resolveOwnerStaffId(admin, principal);

    let orderQuery = admin
      .from("orders")
      .select(
        "customer_whatsapp, customer_name, customer_segment, sale_amount, confirmed_at, confirmed_by_staff_id"
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
    if (hErr) {
      const msg = String(hErr.message ?? "");
      const missingTable =
        /does not exist|schema cache|relation/i.test(msg) ||
        (hErr as { code?: string }).code === "PGRST205";
      if (!missingTable) {
        return NextResponse.json({ error: hErr.message }, { status: 500 });
      }
    } else {
      hiddenSet = new Set(
        (hiddenRows ?? []).map((r: { whatsapp_digits: string }) =>
          String(r.whatsapp_digits ?? "").replace(/\D/g, "")
        )
      );
    }

    const orderRows = (orders ?? []) as OrderRowForClient[];
    const staffIds = Array.from(
      new Set(orderRows.map((r) => r.confirmed_by_staff_id).filter(Boolean))
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

    const staffMap = new Map<string, string>();
    if (staffIds.length) {
      const { data: staffRows } = await admin
        .from("staff_users")
        .select("id, email, full_name")
        .in("id", staffIds);
      for (const raw of staffRows ?? []) {
        const row = raw as { id: string; email: string; full_name?: string | null };
        staffMap.set(
          row.id,
          String(row.full_name ?? "").trim() || nameFromEmail(String(row.email ?? ""))
        );
      }
    }

    const waKeys = new Set<string>();
    for (const o of orderRows) {
      const wa = String(o.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length >= 10) waKeys.add(wa);
    }

    const profileMap = new Map<string, CrmClientProfileRow>();
    if (waKeys.size > 0) {
      const { data: profileRows, error: pErr } = await admin
        .from("crm_client_profiles")
        .select("whatsapp_digits, business_profile")
        .in("whatsapp_digits", Array.from(waKeys));
      if (pErr) {
        const missing = /does not exist|schema cache|relation/i.test(pErr.message);
        if (!missing) {
          return NextResponse.json({ error: pErr.message }, { status: 500 });
        }
      } else {
        for (const raw of profileRows ?? []) {
          const p = raw as CrmClientProfileRow;
          profileMap.set(p.whatsapp_digits, p);
        }
      }
    }

    const byWa = new Map<
      string,
      {
        names: string[];
        order_count: number;
        total_spent: number;
        first_at: string | null;
        last_at: string | null;
        seller_labels: Set<string>;
      }
    >();

    for (const o of orderRows) {
      const wa = String(o.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length < 10) continue;

      const spent = Number(o.sale_amount ?? 0);
      const t = o.confirmed_at;

      const cur = byWa.get(wa) ?? {
        names: [],
        order_count: 0,
        total_spent: 0,
        first_at: null as string | null,
        last_at: null as string | null,
        seller_labels: new Set<string>(),
      };

      cur.order_count += 1;
      if (!Number.isNaN(spent)) cur.total_spent += spent;
      if (o.customer_name?.trim()) cur.names.push(o.customer_name.trim());
      cur.seller_labels.add(sellerLabelForOrder(o, staffMap, ownerName));
      if (t) {
        if (!cur.first_at || t < cur.first_at) cur.first_at = t;
        if (!cur.last_at || t > cur.last_at) cur.last_at = t;
      }

      byWa.set(wa, cur);
    }

    const recencyFilter = request.nextUrl.searchParams.get("recency")?.trim() as
      | ClientRecencyStatus
      | "all"
      | "";
    const profileFilter = request.nextUrl.searchParams.get("profile")?.trim();

    let clients: AdminClientRow[] = Array.from(byWa.entries())
      .filter(([wa]) => !hiddenSet.has(wa))
      .map(([wa, agg]) => {
        const name =
          agg.names.length > 0 ? agg.names[agg.names.length - 1] : null;
        const isNew = agg.order_count <= 1;
        const segment = isNew ? "NOVO" : "ANTIGO";
        const sellers_label = Array.from(agg.seller_labels)
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .join(", ");
        const profile = profileMap.get(wa);
        const businessProfile =
          profile?.business_profile === "lojista" ||
          profile?.business_profile === "revendedor"
            ? profile.business_profile
            : null;
        const lastAt = agg.last_at;

        return {
          customer_whatsapp: wa,
          customer_name: name,
          customer_segment: segment,
          is_new: isNew,
          order_count: agg.order_count,
          total_spent: agg.total_spent,
          first_confirmed_at: agg.first_at,
          last_confirmed_at: lastAt,
          sellers_label: sellers_label || "—",
          business_profile: businessProfile,
          recency_status: clientRecencyStatus(lastAt),
        };
      });

    if (recencyFilter && recencyFilter !== "all") {
      clients = clients.filter((c) => c.recency_status === recencyFilter);
    }
    if (profileFilter === "lojista" || profileFilter === "revendedor") {
      clients = clients.filter((c) => c.business_profile === profileFilter);
    } else if (profileFilter === "sem_perfil") {
      clients = clients.filter((c) => !c.business_profile);
    }

    clients.sort((a, b) => {
      const order = { red: 0, yellow: 1, green: 2, none: 3 };
      const ra = order[a.recency_status];
      const rb = order[b.recency_status];
      if (ra !== rb) return ra - rb;
      const ta = a.last_confirmed_at ?? "";
      const tb = b.last_confirmed_at ?? "";
      return tb.localeCompare(ta);
    });

    return NextResponse.json({ clients });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/clients — oculta o contacto na lista de Clientes (não apaga pedidos nem métricas).
 */
export async function DELETE(request: NextRequest) {
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }
    const raw = (body as Record<string, unknown>)?.customer_whatsapp;
    const wa = String(raw ?? "")
      .replace(/\D/g, "")
      .trim();
    if (wa.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido (mínimo 10 dígitos)" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("crm_hidden_contacts").upsert(
      { whatsapp_digits: wa },
      { onConflict: "whatsapp_digits" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
