import { NextRequest, NextResponse } from "next/server";
import {
  attachDisplayNumbers,
  fetchAllOrderIdsNewestFirst,
} from "@/lib/order-display-number";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";

export const runtime = "nodejs";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PeriodKey =
  | "today"
  | "yesterday"
  | "weekly"
  | "monthly"
  | "yearly"
  | "last30"
  | "all"
  | "selectedDate";

function periodStartIso(period: PeriodKey): string | null {
  const now = new Date();
  const d = new Date(now);
  if (period === "all") return null;
  if (period === "today") {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "yesterday") {
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "weekly") {
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "monthly") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "yearly") {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function parseSelectedDateUtcRange(
  raw: string | null,
  tzOffsetMinutesRaw: string | null
): { startIso: string; endIso: string } | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [yRaw, mRaw, dRaw] = raw.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const tzOffsetMinutes = Number(tzOffsetMinutesRaw ?? "0");
  if (!Number.isFinite(tzOffsetMinutes)) return null;
  // Converte o "dia local" selecionado no browser para janela UTC exata [início, fim).
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
}

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

/** Escapa `%` e `_` para literais em filtros `ilike` do PostgREST. */
function escapeIlikeToken(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Condições OR em `requested_seller_name` para pedidos pendentes (nome gravado no checkout).
 * Compara pelo nome completo e pelo primeiro token (ex.: "Paulo" em "Paulo Henrique").
 * Valores com espaços vão entre aspas para o PostgREST.
 */
function buildPendingRequestedSellerOr(
  staffDisplay: string,
  opts: { includeUnassigned: boolean }
): string | null {
  const d = staffDisplay.trim();
  const first = d ? d.split(/\s+/)[0]!.trim() : "";
  const labels = new Set<string>();
  if (d) labels.add(d);
  if (first) labels.add(first);
  const parts: string[] = [];
  if (opts.includeUnassigned) parts.push("requested_seller_name.is.null");
  for (const lab of Array.from(labels)) {
    const e = escapeIlikeToken(lab);
    if (!e) continue;
    const inner = e.replace(/"/g, '\\"');
    parts.push(`requested_seller_name.ilike."${inner}"`);
    parts.push(`requested_seller_name.ilike."${inner}%"`);
  }
  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).join(",");
}

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

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") ?? "PENDENTE_PAGAMENTO";
  const rawPeriod = searchParams.get("period");
  const period: PeriodKey =
    rawPeriod === "today" ||
    rawPeriod === "daily" ||
    rawPeriod === "yesterday" ||
    rawPeriod === "weekly" ||
    rawPeriod === "monthly" ||
    rawPeriod === "yearly" ||
    rawPeriod === "last30" ||
    rawPeriod === "selectedDate"
      ? rawPeriod === "daily"
        ? "today"
        : rawPeriod
      : "all";
  const startIso = periodStartIso(period);
  const selectedDateRange =
    period === "selectedDate"
      ? parseSelectedDateUtcRange(
          searchParams.get("selectedDate"),
          searchParams.get("tzOffsetMinutes")
        )
      : null;

  try {
    const principal = await resolvePrincipal(request);
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;
    const isOwnerPrincipal =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");
    const rawSellerScope = searchParams.get("sellerScope")?.trim() ?? "";

    const admin = createAdminClient();
    let q = admin
      .from("orders")
      .select(
        `
        *,
        order_items (*)
      `
      );

    if (statusFilter !== "all") {
      q = q.eq("status", statusFilter);
      if (statusFilter === "PAGO") {
        if (sellerId) {
          q = q.eq("confirmed_by_staff_id", sellerId);
        } else if (isOwnerPrincipal && rawSellerScope && rawSellerScope !== "all") {
          if (rawSellerScope === "me") {
            let ownerStaffId: string | null =
              principal?.kind === "staff" && principal.staff.role === "owner"
                ? principal.staff.staffId
                : null;
            if (!ownerStaffId && principal?.kind === "api_key") {
              const { data: ownerRow } = await admin
                .from("staff_users")
                .select("id")
                .eq("role", "owner")
                .limit(1)
                .maybeSingle();
              ownerStaffId = (ownerRow?.id as string | undefined) ?? null;
            }
            if (ownerStaffId) {
              q = q.or(
                `confirmed_by_staff_id.eq.${ownerStaffId},confirmed_by_staff_id.is.null`
              );
            }
          } else if (STAFF_UUID_RE.test(rawSellerScope)) {
            q = q.eq("confirmed_by_staff_id", rawSellerScope);
          }
        }
      } else if (statusFilter === "PENDENTE_PAGAMENTO") {
        if (!sellerId && isOwnerPrincipal && rawSellerScope && rawSellerScope !== "all") {
          if (rawSellerScope === "me") {
            const { data: own } = await admin
              .from("staff_users")
              .select("email, full_name")
              .eq("role", "owner")
              .limit(1)
              .maybeSingle();
            const display =
              String(own?.full_name ?? "").trim() ||
              nameFromEmail(String(own?.email ?? ""));
            const clause = buildPendingRequestedSellerOr(display, {
              includeUnassigned: true,
            });
            if (clause) q = q.or(clause);
          } else if (STAFF_UUID_RE.test(rawSellerScope)) {
            const { data: st } = await admin
              .from("staff_users")
              .select("email, full_name")
              .eq("id", rawSellerScope)
              .maybeSingle();
            const display =
              String(st?.full_name ?? "").trim() ||
              nameFromEmail(String(st?.email ?? ""));
            const clause = buildPendingRequestedSellerOr(display, {
              includeUnassigned: false,
            });
            if (clause) q = q.or(clause);
          }
        }
      }
    } else if (sellerId) {
      q = q.or(
        `status.eq.PENDENTE_PAGAMENTO,and(status.eq.PAGO,confirmed_by_staff_id.eq.${sellerId})`
      );
    }
    if (selectedDateRange) {
      if (statusFilter === "PAGO") {
        q = q.gte("confirmed_at", selectedDateRange.startIso).lt("confirmed_at", selectedDateRange.endIso);
      } else {
        q = q.gte("created_at", selectedDateRange.startIso).lt("created_at", selectedDateRange.endIso);
      }
    } else if (period === "yesterday") {
      const end = new Date(startIso!);
      end.setDate(end.getDate() + 1);
      const endIso = end.toISOString();
      if (statusFilter === "PAGO") {
        q = q.gte("confirmed_at", startIso!).lt("confirmed_at", endIso);
      } else {
        q = q.gte("created_at", startIso!).lt("created_at", endIso);
      }
    } else if (startIso) {
      if (statusFilter === "PAGO") {
        q = q.gte("confirmed_at", startIso);
      } else {
        q = q.gte("created_at", startIso);
      }
    }

    if (statusFilter === "PAGO") {
      q = q
        .order("confirmed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as Array<{
      id: string;
      confirmed_by_staff_id?: string | null;
      requested_seller_name?: string | null;
      [k: string]: unknown;
    }>;
    const staffIds = Array.from(
      new Set(rows.map((r) => r.confirmed_by_staff_id).filter(Boolean))
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
        const name = row.full_name?.trim() || nameFromEmail(row.email);
        staffMap.set(row.id, name);
      }
    }
    const withStaffName = rows.map((r) => ({
      ...r,
      confirmed_by_staff_name: r.confirmed_by_staff_id
        ? (staffMap.get(r.confirmed_by_staff_id) ?? ownerName)
        : ownerName,
    }));
    const needsLegacyRank = withStaffName.some((r) => {
      const dn = (r as { display_number?: number | null }).display_number;
      return !(typeof dn === "number" && Number.isFinite(dn) && dn > 0);
    });
    const idsGlobal = needsLegacyRank ? await fetchAllOrderIdsNewestFirst() : [];
    const orders = attachDisplayNumbers(withStaffName, idsGlobal);
    return NextResponse.json({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
