import { NextRequest, NextResponse } from "next/server";
import {
  attachDisplayNumbers,
  fetchAllOrderIdsNewestFirst,
} from "@/lib/order-display-number";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";

export const runtime = "nodejs";

type PeriodKey = "daily" | "weekly" | "monthly" | "yearly" | "last30" | "all";

function periodStartIso(period: PeriodKey): string | null {
  const now = new Date();
  const d = new Date(now);
  if (period === "all") return null;
  if (period === "daily") {
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
    rawPeriod === "daily" ||
    rawPeriod === "weekly" ||
    rawPeriod === "monthly" ||
    rawPeriod === "yearly" ||
    rawPeriod === "last30"
      ? rawPeriod
      : "all";
  const startIso = periodStartIso(period);

  try {
    const principal = await resolvePrincipal(request);
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;

    const admin = createAdminClient();
    let q = admin
      .from("orders")
      .select(
        `
        *,
        order_items (*)
      `
      )
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      q = q.eq("status", statusFilter);
      if (sellerId && statusFilter === "PAGO") {
        q = q.eq("confirmed_by_staff_id", sellerId);
      }
    } else if (sellerId) {
      q = q.or(
        `status.eq.PENDENTE_PAGAMENTO,and(status.eq.PAGO,confirmed_by_staff_id.eq.${sellerId})`
      );
    }
    if (startIso) {
      if (statusFilter === "PAGO") {
        q = q.gte("confirmed_at", startIso);
      } else {
        q = q.gte("created_at", startIso);
      }
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
    const idsGlobal = await fetchAllOrderIdsNewestFirst();
    const orders = attachDisplayNumbers(withStaffName, idsGlobal);
    return NextResponse.json({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
