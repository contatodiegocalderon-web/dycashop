import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  followUpDueAtIso,
  needsFollowUp,
  sellerFollowUpKey,
  type BusinessProfile,
  type CrmClientProfileRow,
  type CrmSellerFollowUpRow,
} from "@/lib/client-follow-up";

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
  needs_follow_up: boolean;
  follow_up_due_at: string | null;
  follow_up_completed_at: string | null;
  follow_up_staff_id: string | null;
  business_profile: BusinessProfile | null;
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

function staffIdForOrder(
  o: OrderRowForClient,
  ownerStaffId: string | null
): string | null {
  return o.confirmed_by_staff_id ?? ownerStaffId;
}

/**
 * GET /api/admin/clients — clientes com pedido pago e dados de venda registados.
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
    const ownerStaffId = await resolveOwnerStaffId(admin, principal);

    let orderQuery = admin
      .from("orders")
      .select(
        "customer_whatsapp, customer_name, customer_segment, sale_amount, confirmed_at, confirmed_by_staff_id"
      )
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    const ownerAllView =
      isOwnerPrincipal && !sellerId && rawSellerScope === "all";

    if (sellerId) {
      orderQuery = orderQuery.eq("confirmed_by_staff_id", sellerId);
    } else if (isOwnerPrincipal && rawSellerScope && rawSellerScope !== "all") {
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

    const waKeysPreview = new Set<string>();
    for (const o of orderRows) {
      const wa = String(o.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length >= 10) waKeysPreview.add(wa);
    }

    const profileMap = new Map<string, CrmClientProfileRow>();
    const sellerFollowMap = new Map<string, string>();

    if (waKeysPreview.size > 0) {
      const waList = Array.from(waKeysPreview);
      const { data: profileRows, error: pErr } = await admin
        .from("crm_client_profiles")
        .select("whatsapp_digits, business_profile")
        .in("whatsapp_digits", waList);
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

      const { data: followRows, error: fErr } = await admin
        .from("crm_seller_follow_ups")
        .select("whatsapp_digits, staff_id, follow_up_completed_at")
        .in("whatsapp_digits", waList);
      if (fErr) {
        const missing = /does not exist|schema cache|relation/i.test(fErr.message);
        if (!missing) {
          return NextResponse.json({ error: fErr.message }, { status: 500 });
        }
      } else {
        for (const raw of followRows ?? []) {
          const row = raw as CrmSellerFollowUpRow;
          sellerFollowMap.set(
            sellerFollowUpKey(row.whatsapp_digits, row.staff_id),
            row.follow_up_completed_at
          );
        }
      }
    }

    const followUpStaffScope: string | null = sellerId
      ? sellerId
      : rawSellerScope === "me"
        ? ownerStaffId
        : STAFF_UUID_RE.test(rawSellerScope)
          ? rawSellerScope
          : null;

    const byWa = new Map<
      string,
      {
        names: string[];
        segments: string[];
        order_count: number;
        total_spent: number;
        first_at: string | null;
        last_at: string | null;
        last_staff_id: string | null;
        seller_labels: Set<string>;
      }
    >();

    for (const o of orderRows) {
      const wa = String(o.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length < 10) continue;

      const spent = Number(o.sale_amount ?? 0);
      const t = o.confirmed_at;
      const orderStaffId = staffIdForOrder(o, ownerStaffId);

      const cur = byWa.get(wa) ?? {
        names: [],
        segments: [],
        order_count: 0,
        total_spent: 0,
        first_at: null as string | null,
        last_at: null as string | null,
        last_staff_id: null as string | null,
        seller_labels: new Set<string>(),
      };

      cur.order_count += 1;
      if (!Number.isNaN(spent)) cur.total_spent += spent;
      if (o.customer_name?.trim()) cur.names.push(o.customer_name.trim());
      if (o.customer_segment) cur.segments.push(o.customer_segment);
      cur.seller_labels.add(sellerLabelForOrder(o, staffMap, ownerName));
      if (t) {
        if (!cur.first_at || t < cur.first_at) cur.first_at = t;
        if (!cur.last_at || t > cur.last_at) {
          cur.last_at = t;
          cur.last_staff_id = orderStaffId;
        }
      }

      byWa.set(wa, cur);
    }

    const clients: AdminClientRow[] = Array.from(byWa.entries())
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

        const responsibleStaffId = followUpStaffScope ?? agg.last_staff_id;
        const lastAt = agg.last_at;
        const followUpCompletedAt =
          responsibleStaffId && !ownerAllView
            ? sellerFollowMap.get(
                sellerFollowUpKey(wa, responsibleStaffId)
              ) ?? null
            : null;
        const dueAt = lastAt ? followUpDueAtIso(lastAt) : null;

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
          needs_follow_up:
            !ownerAllView &&
            !!responsibleStaffId &&
            needsFollowUp(lastAt, followUpCompletedAt),
          follow_up_due_at: dueAt,
          follow_up_completed_at: followUpCompletedAt,
          follow_up_staff_id: responsibleStaffId,
          business_profile: businessProfile,
        };
      });

    clients.sort((a, b) => {
      const ta = a.last_confirmed_at ?? "";
      const tb = b.last_confirmed_at ?? "";
      return tb.localeCompare(ta);
    });

    let follow_up_queue: AdminClientRow[] = [];

    if (ownerAllView) {
      const { data: allOrders, error: allErr } = await admin
        .from("orders")
        .select(
          "customer_whatsapp, customer_name, confirmed_at, confirmed_by_staff_id"
        )
        .eq("status", "PAGO")
        .not("customer_whatsapp", "is", null);

      if (allErr) {
        return NextResponse.json({ error: allErr.message }, { status: 500 });
      }

      const allWaKeys = new Set<string>();
      const byWaStaff = new Map<
        string,
        { last_at: string; name: string | null; staff_id: string }
      >();

      for (const raw of allOrders ?? []) {
        const o = raw as OrderRowForClient;
        const wa = String(o.customer_whatsapp ?? "").replace(/\D/g, "");
        if (wa.length < 10 || hiddenSet.has(wa)) continue;
        const sid = staffIdForOrder(o, ownerStaffId);
        if (!sid || !o.confirmed_at) continue;

        allWaKeys.add(wa);
        const key = sellerFollowUpKey(wa, sid);
        const cur = byWaStaff.get(key);
        if (!cur || o.confirmed_at > cur.last_at) {
          byWaStaff.set(key, {
            last_at: o.confirmed_at,
            name: o.customer_name?.trim() ?? null,
            staff_id: sid,
          });
        }
      }

      if (allWaKeys.size > 0) {
        const missingWa = Array.from(allWaKeys).filter((w) => !profileMap.has(w));
        if (missingWa.length > 0) {
          const { data: extraProfiles } = await admin
            .from("crm_client_profiles")
            .select("whatsapp_digits, business_profile")
            .in("whatsapp_digits", missingWa);
          for (const raw of extraProfiles ?? []) {
            const p = raw as CrmClientProfileRow;
            profileMap.set(p.whatsapp_digits, p);
          }
        }

        const { data: allFollowRows } = await admin
          .from("crm_seller_follow_ups")
          .select("whatsapp_digits, staff_id, follow_up_completed_at")
          .in("whatsapp_digits", Array.from(allWaKeys));

        for (const raw of allFollowRows ?? []) {
          const row = raw as CrmSellerFollowUpRow;
          sellerFollowMap.set(
            sellerFollowUpKey(row.whatsapp_digits, row.staff_id),
            row.follow_up_completed_at
          );
        }
      }

      const queue: AdminClientRow[] = [];
      for (const [key, agg] of Array.from(byWaStaff.entries())) {
        const wa = key.split("|")[0]!;
        const completed =
          sellerFollowMap.get(sellerFollowUpKey(wa, agg.staff_id)) ?? null;
        if (!needsFollowUp(agg.last_at, completed)) continue;

        const profile = profileMap.get(wa);
        const businessProfile =
          profile?.business_profile === "lojista" ||
          profile?.business_profile === "revendedor"
            ? profile.business_profile
            : null;
        const clientAgg = byWa.get(wa);

        queue.push({
          customer_whatsapp: wa,
          customer_name: agg.name ?? clientAgg?.names.at(-1) ?? null,
          customer_segment: "ANTIGO",
          is_new: false,
          order_count: clientAgg?.order_count ?? 0,
          total_spent: clientAgg?.total_spent ?? 0,
          first_confirmed_at: clientAgg?.first_at ?? null,
          last_confirmed_at: agg.last_at,
          sellers_label:
            staffMap.get(agg.staff_id) ??
            (agg.staff_id === ownerStaffId ? ownerName : "Vendedor"),
          needs_follow_up: true,
          follow_up_due_at: followUpDueAtIso(agg.last_at),
          follow_up_completed_at: completed,
          follow_up_staff_id: agg.staff_id,
          business_profile: businessProfile,
        });
      }

      follow_up_queue = queue.sort((a, b) =>
        (a.follow_up_due_at ?? "").localeCompare(b.follow_up_due_at ?? "")
      );
    } else {
      follow_up_queue = clients
        .filter((c) => c.needs_follow_up)
        .sort((a, b) =>
          (a.follow_up_due_at ?? "").localeCompare(b.follow_up_due_at ?? "")
        );
    }

    return NextResponse.json({ clients, follow_up_queue });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/clients — oculta o contacto na lista de Clientes (não apaga pedidos nem métricas).
 * Corpo JSON: { customer_whatsapp: string }
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
