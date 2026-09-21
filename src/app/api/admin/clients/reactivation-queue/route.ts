import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { applyCrmSellerOrderScope } from "@/lib/crm-seller-order-filter";
import { applyPendingOrdersSellerScope } from "@/lib/crm-pending-seller-filter";
import {
  fetchAllCrmPaidOrders,
  fetchCrmProfilesByWhatsapp,
  type CrmPaidOrdersListQuery,
} from "@/lib/admin-orders-query";
import {
  cancelledOrderQualifiesForAbandoned,
  hasOpenOrderFlag,
  loadLastPaidAtByWhatsapp,
  loadOpenOrderWhatsappLookup,
} from "@/lib/crm-abandoned-query";
import {
  CRM_ABANDONED_FOLLOW_UP_MAX,
} from "@/lib/crm-funnel";
import {
  abandonCampaign,
  calendarDaysSince,
  isAbandonedDue,
  isReactivationCampaign,
  matchStaffByRequestedName,
  paidCampaignForDays,
  reactivationTaskKey,
  reactivationWhatsAppMessage,
  selectQueueTasks,
  sortTasksForDisplay,
  type ReactivationCampaign,
} from "@/lib/crm-reactivation";
import {
  expandWhatsappQueryKeys,
  normalizeWhatsappDigits,
  whatsappMatchesLookup,
  buildWhatsappLookup,
  lookupWhatsappMapValue,
} from "@/lib/whatsapp-normalize";
import { SITE_VAREJO_SELLER } from "@/lib/crm-legacy-import";
import { formatOrderItemsPhrase } from "@/lib/order-category-totals";
import type { BusinessProfile } from "@/lib/client-follow-up";

export const runtime = "nodejs";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IN_CHUNK = 150;

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

function staffDisplayName(row: {
  full_name?: string | null;
  email?: string | null;
}): string {
  return (
    String(row.full_name ?? "").trim() ||
    nameFromEmail(String(row.email ?? "")) ||
    "Vendedor"
  );
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

export type ReactivationQueueTask = {
  customer_whatsapp: string;
  customer_name: string | null;
  campaign: ReactivationCampaign;
  cycle_anchor: string;
  days: number;
  message: string;
  staff_id: string | null;
  seller_name: string;
  sortAt: string;
};

export type ReactivationQueueGroup = {
  staff_key: string;
  staff_id: string | null;
  seller_name: string;
  tasks: ReactivationQueueTask[];
  stage5_waiting: number;
};

type DueTask = ReactivationQueueTask & { staffKey: string };

async function loadCompletions(
  admin: ReturnType<typeof createAdminClient>,
  whatsapps: string[]
): Promise<Set<string>> {
  const done = new Set<string>();
  const keys = expandWhatsappQueryKeys(whatsapps);
  if (!keys.length) return done;
  for (let i = 0; i < keys.length; i += IN_CHUNK) {
    const chunk = keys.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("crm_reactivation_tasks")
      .select("whatsapp_digits, campaign, cycle_anchor")
      .in("whatsapp_digits", chunk);
    if (error) {
      const missing = /does not exist|schema cache|relation/i.test(
        error.message
      );
      if (missing) {
        throw Object.assign(new Error("Tabela de reativação em falta."), {
          hint: "Execute supabase/migration_crm_reactivation_tasks.sql no Supabase.",
          status: 503,
        });
      }
      throw new Error(error.message);
    }
    for (const raw of data ?? []) {
      const r = raw as {
        whatsapp_digits: string;
        campaign: string;
        cycle_anchor: string;
      };
      if (!isReactivationCampaign(r.campaign)) continue;
      const wa = normalizeWhatsappDigits(r.whatsapp_digits);
      done.add(reactivationTaskKey(wa, r.campaign, r.cycle_anchor));
    }
  }
  return done;
}

function sellerLabelForPaid(
  staffId: string | null,
  requested: string | null,
  staffMap: Map<string, string>,
  ownerName: string
): string {
  if (staffId && staffMap.has(staffId)) return staffMap.get(staffId)!;
  const req = requested?.trim();
  if (req === SITE_VAREJO_SELLER) return "Site / Varejo";
  if (req && req !== "?") return req;
  return ownerName;
}

function profileFor(
  wa: string,
  profileMap: Awaited<ReturnType<typeof fetchCrmProfilesByWhatsapp>>,
  requestedSeller?: string | null
): BusinessProfile | null {
  if (requestedSeller?.trim() === SITE_VAREJO_SELLER) return "uso_proprio";
  const raw = lookupWhatsappMapValue(wa, profileMap)?.business_profile;
  if (raw === "lojista" || raw === "revendedor" || raw === "uso_proprio") {
    return raw;
  }
  return null;
}

/**
 * GET /api/admin/clients/reactivation-queue
 * Tarefas do dia, agrupadas por vendedor.
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

    const { data: staffRows } = await admin
      .from("staff_users")
      .select("id, email, full_name, role");
    const staffList = (staffRows ?? []) as Array<{
      id: string;
      email: string;
      full_name: string | null;
      role: string;
    }>;
    const staffMap = new Map<string, string>();
    let ownerName = "Dono";
    for (const s of staffList) {
      const label = staffDisplayName(s);
      staffMap.set(s.id, label);
      if (s.role === "owner") ownerName = label;
    }

    const { data: hiddenRows } = await admin
      .from("crm_hidden_contacts")
      .select("whatsapp_digits");
    const hiddenSet = new Set(
      (hiddenRows ?? []).map((r: { whatsapp_digits: string }) =>
        normalizeWhatsappDigits(r.whatsapp_digits)
      )
    );

    const orderRows = await fetchAllCrmPaidOrders(admin, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = admin
        .from("orders")
        .select(
          "customer_whatsapp, customer_name, confirmed_at, confirmed_by_staff_id, requested_seller_name"
        )
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

    const lastPaidByWa: Record<
      string,
      {
        name: string | null;
        last_at: string;
        staff_id: string | null;
        requested: string | null;
      }
    > = {};

    for (const o of orderRows) {
      const wa = normalizeWhatsappDigits(o.customer_whatsapp);
      if (wa.length < 10 || hiddenSet.has(wa) || !o.confirmed_at) continue;
      const cur = lastPaidByWa[wa];
      if (!cur || o.confirmed_at > cur.last_at) {
        lastPaidByWa[wa] = {
          name: o.customer_name,
          last_at: o.confirmed_at,
          staff_id: o.confirmed_by_staff_id ?? ownerStaffId ?? null,
          requested: o.requested_seller_name ?? null,
        };
      } else if (o.customer_name?.trim() && !cur.name) {
        cur.name = o.customer_name;
      }
    }

    const { data: paidWaRows } = await admin
      .from("orders")
      .select("customer_whatsapp")
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);
    const registeredWa = buildWhatsappLookup(
      (paidWaRows ?? []) as Array<{ customer_whatsapp: string }>
    );

    const openOrderLookup = await loadOpenOrderWhatsappLookup(admin);
    const lastPaidAtByWa = await loadLastPaidAtByWhatsapp(admin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cq: any = admin
      .from("orders")
      .select(
        "id, customer_whatsapp, customer_name, requested_seller_name, created_at, order_items(quantity, snapshot_category)"
      )
      .eq("status", "CANCELADO")
      .not("customer_whatsapp", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    cq = await applyPendingOrdersSellerScope(admin, cq, {
      principal,
      rawSellerScope,
    });

    const { data: cancelled, error: cErr } = await cq;
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    const abandonedLatest = new Map<
      string,
      {
        created_at: string;
        customer_name: string | null;
        requested_seller_name: string | null;
        order_phrase: string;
      }
    >();
    for (const raw of cancelled ?? []) {
      const o = raw as {
        customer_whatsapp: string;
        customer_name: string | null;
        requested_seller_name: string | null;
        created_at: string;
        order_items?: Array<{
          quantity: number;
          snapshot_category?: string | null;
        }> | null;
      };
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
      const cur = abandonedLatest.get(wa);
      if (!cur || o.created_at > cur.created_at) {
        abandonedLatest.set(wa, {
          created_at: o.created_at,
          customer_name: o.customer_name,
          requested_seller_name: o.requested_seller_name,
          order_phrase: formatOrderItemsPhrase(o.order_items),
        });
      }
    }

    const waForDone = new Set<string>([
      ...Object.keys(lastPaidByWa),
      ...Array.from(abandonedLatest.keys()),
    ]);
    const done = await loadCompletions(admin, Array.from(waForDone));
    const profileMap = await fetchCrmProfilesByWhatsapp(
      admin,
      expandWhatsappQueryKeys(Array.from(waForDone))
    );

    const due: DueTask[] = [];
    const now = new Date();

    for (const [wa, agg] of Object.entries(lastPaidByWa)) {
      const days = calendarDaysSince(agg.last_at, now);
      const campaign = paidCampaignForDays(days);
      if (!campaign) continue;
      const cycle = agg.last_at;
      if (done.has(reactivationTaskKey(wa, campaign, cycle))) continue;
      const staff_id = agg.staff_id;
      const seller_name = sellerLabelForPaid(
        staff_id,
        agg.requested,
        staffMap,
        ownerName
      );
      const staffKey = staff_id ?? `name:${seller_name}`;
      due.push({
        customer_whatsapp: wa,
        customer_name: agg.name,
        campaign,
        cycle_anchor: cycle,
        days,
        message: reactivationWhatsAppMessage(
          campaign,
          agg.name,
          null,
          profileFor(wa, profileMap)
        ),
        staff_id,
        seller_name,
        sortAt: agg.last_at,
        staffKey,
      });
    }

    for (const [wa, row] of Array.from(abandonedLatest.entries())) {
      if (hasOpenOrderFlag(wa, openOrderLookup)) continue;
      const hasPaid = whatsappMatchesLookup(wa, registeredWa);
      if (!isAbandonedDue(row.created_at, hasPaid, now)) continue;
      const campaign = abandonCampaign(hasPaid);
      if (done.has(reactivationTaskKey(wa, campaign, row.created_at))) continue;
      const staff_id = matchStaffByRequestedName(
        row.requested_seller_name,
        staffList
      );
      let seller_name: string;
      if (staff_id && staffMap.has(staff_id)) {
        seller_name = staffMap.get(staff_id)!;
      } else if (row.requested_seller_name?.trim() === SITE_VAREJO_SELLER) {
        seller_name = "Site / Varejo";
      } else {
        seller_name = row.requested_seller_name?.trim() || "Sem vendedor";
      }
      const staffKey = staff_id ?? `name:${seller_name}`;
      due.push({
        customer_whatsapp: wa,
        customer_name: row.customer_name,
        campaign,
        cycle_anchor: row.created_at,
        days: calendarDaysSince(row.created_at, now),
        message: reactivationWhatsAppMessage(
          campaign,
          row.customer_name,
          row.order_phrase,
          profileFor(wa, profileMap, row.requested_seller_name)
        ),
        staff_id,
        seller_name,
        sortAt: row.created_at,
        staffKey,
      });
    }

    if (sellerId) {
      const mine = staffMap.get(sellerId) ?? "";
      const mineNorm = mine
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const mineFirst = mineNorm.split(/\s+/)[0] ?? "";
      for (let i = due.length - 1; i >= 0; i--) {
        const t = due[i]!;
        if (t.staff_id === sellerId) continue;
        const sn = t.seller_name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        const ok =
          !t.staff_id &&
          mineFirst.length > 2 &&
          (sn === mineNorm || sn.startsWith(mineFirst));
        if (!ok) due.splice(i, 1);
      }
    }

    const { selected, stage5HiddenByStaff } = selectQueueTasks(due);
    const groupsMap = new Map<string, ReactivationQueueGroup>();
    for (const t of selected) {
      const g = groupsMap.get(t.staffKey) ?? {
        staff_key: t.staffKey,
        staff_id: t.staff_id,
        seller_name: t.seller_name,
        tasks: [] as ReactivationQueueTask[],
        stage5_waiting: stage5HiddenByStaff.get(t.staffKey) ?? 0,
      };
      g.tasks.push(t);
      groupsMap.set(t.staffKey, g);
    }
    for (const [key, n] of Array.from(stage5HiddenByStaff.entries())) {
      if (groupsMap.has(key)) continue;
      const sample = due.find((t) => t.staffKey === key);
      groupsMap.set(key, {
        staff_key: key,
        staff_id: sample?.staff_id ?? null,
        seller_name: sample?.seller_name ?? "Vendedor",
        tasks: [],
        stage5_waiting: n,
      });
    }

    const groups = Array.from(groupsMap.values())
      .map((g) => ({
        ...g,
        tasks: sortTasksForDisplay(g.tasks),
      }))
      .filter((g) => g.tasks.length > 0)
      .sort((a, b) =>
        a.seller_name.localeCompare(b.seller_name, "pt-BR")
      );

    const visible = groups.reduce((n, g) => n + g.tasks.length, 0);
    const waiting5 = groups.reduce((n, g) => n + g.stage5_waiting, 0);

    return NextResponse.json({
      groups,
      total: visible,
      stage5_waiting: waiting5,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    const hint = (e as { hint?: string }).hint;
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: msg, ...(hint ? { hint } : {}) }, { status });
  }
}

/**
 * POST /api/admin/clients/reactivation-queue
 * Confirma follow-up e tira o lead da fila deste ciclo.
 */
export async function POST(request: NextRequest) {
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
    const rec = body as Record<string, unknown>;
    const wa = normalizeWhatsappDigits(String(rec.customer_whatsapp ?? ""));
    const campaignRaw = String(rec.campaign ?? "");
    const cycle_anchor = String(rec.cycle_anchor ?? "").trim();
    const staffRaw = String(rec.staff_id ?? "").trim();

    if (wa.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido." },
        { status: 400 }
      );
    }
    if (!isReactivationCampaign(campaignRaw)) {
      return NextResponse.json({ error: "Campanha inválida." }, { status: 400 });
    }
    if (!cycle_anchor) {
      return NextResponse.json(
        { error: "Âncora do ciclo em falta." },
        { status: 400 }
      );
    }

    const principal = await resolvePrincipal(request);
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;
    const actorStaffId =
      principal?.kind === "staff" ? principal.staff.staffId : null;

    if (sellerId && staffRaw && STAFF_UUID_RE.test(staffRaw) && staffRaw !== sellerId) {
      return NextResponse.json(
        { error: "Só pode confirmar follow-up dos seus próprios leads." },
        { status: 403 }
      );
    }

    const staff_id =
      sellerId ??
      (STAFF_UUID_RE.test(staffRaw) ? staffRaw : null);

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error: upsErr } = await admin.from("crm_reactivation_tasks").upsert(
      {
        whatsapp_digits: wa,
        campaign: campaignRaw,
        cycle_anchor,
        staff_id,
        completed_at: now,
        completed_by_staff_id: actorStaffId,
      },
      { onConflict: "whatsapp_digits,campaign,cycle_anchor" }
    );

    if (upsErr) {
      const missing = /does not exist|schema cache|relation/i.test(
        upsErr.message
      );
      return NextResponse.json(
        {
          error: upsErr.message,
          ...(missing
            ? {
                hint: "Execute supabase/migration_crm_reactivation_tasks.sql no Supabase.",
              }
            : {}),
        },
        { status: missing ? 503 : 500 }
      );
    }

    if (campaignRaw === "abandon_new" || campaignRaw === "abandon_repeat") {
      const { data: existing } = await admin
        .from("crm_abandoned_follow_ups")
        .select("follow_up_count")
        .eq("whatsapp_digits", wa)
        .maybeSingle();
      const prev = Number(
        (existing as { follow_up_count?: number } | null)?.follow_up_count ?? 0
      );
      await admin.from("crm_abandoned_follow_ups").upsert(
        {
          whatsapp_digits: wa,
          follow_up_count: Math.min(prev + 1, CRM_ABANDONED_FOLLOW_UP_MAX),
        },
        { onConflict: "whatsapp_digits" }
      );
    } else if (staff_id) {
      await admin.from("crm_seller_follow_ups").upsert(
        {
          whatsapp_digits: wa,
          staff_id,
          follow_up_completed_at: now,
        },
        { onConflict: "whatsapp_digits,staff_id" }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
