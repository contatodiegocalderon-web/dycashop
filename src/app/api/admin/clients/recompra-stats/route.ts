import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * GET /api/admin/clients/recompra-stats
 * Dono: quantos clientes importados com vendedor «?» voltaram a comprar com cada vendedor.
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

  const principal = await resolvePrincipal(request);
  const isOwner =
    principal?.kind === "api_key" ||
    (principal?.kind === "staff" && principal.staff.role === "owner");
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o dono." }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { data: orders, error } = await admin
      .from("orders")
      .select(
        "customer_whatsapp, confirmed_by_staff_id, requested_seller_name, legacy_import"
      )
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const legacyWa = new Set<string>();
    const realByWa = new Map<string, Set<string>>();

    for (const raw of orders ?? []) {
      const o = raw as {
        customer_whatsapp: string;
        confirmed_by_staff_id: string | null;
        requested_seller_name: string | null;
        legacy_import?: boolean;
      };
      const wa = normalizeWhatsappDigits(o.customer_whatsapp);
      if (wa.length < 12) continue;

      const isLegacy =
        o.legacy_import === true ||
        (o.requested_seller_name?.trim() === "?" && !o.confirmed_by_staff_id);
      if (isLegacy) {
        legacyWa.add(wa);
        continue;
      }
      const sid = o.confirmed_by_staff_id?.trim();
      if (!sid) continue;
      const set = realByWa.get(wa) ?? new Set<string>();
      set.add(sid);
      realByWa.set(wa, set);
    }

    const recompraByStaff = new Map<string, number>();
    for (const [wa, staffSet] of Array.from(realByWa.entries())) {
      if (!legacyWa.has(wa)) continue;
      for (const sid of Array.from(staffSet)) {
        recompraByStaff.set(sid, (recompraByStaff.get(sid) ?? 0) + 1);
      }
    }

    const staffIds = Array.from(recompraByStaff.keys());
    const staffMap = new Map<string, string>();
    if (staffIds.length) {
      const { data: staffRows } = await admin
        .from("staff_users")
        .select("id, email, full_name")
        .in("id", staffIds);
      for (const s of staffRows ?? []) {
        const row = s as { id: string; email: string; full_name?: string | null };
        staffMap.set(
          row.id,
          String(row.full_name ?? "").trim() || nameFromEmail(String(row.email ?? ""))
        );
      }
    }

    const sellers = staffIds
      .map((id) => ({
        staffId: id,
        staffName: staffMap.get(id) ?? "Vendedor",
        recompraCount: recompraByStaff.get(id) ?? 0,
      }))
      .sort((a, b) => b.recompraCount - a.recompraCount);

    return NextResponse.json({
      legacyClients: legacyWa.size,
      sellers,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
