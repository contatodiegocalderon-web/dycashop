import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";

export const runtime = "nodejs";

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
 * GET /api/admin/staff-seller-filters
 * Lista dono + vendedores (para filtros no histórico / métricas). Só dono ou chave API.
 */
export async function GET(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: owner, error: oErr } = await admin
      .from("staff_users")
      .select("id, email, full_name")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    const { data: sellers, error: sErr } = await admin
      .from("staff_users")
      .select("id, email, full_name")
      .eq("role", "seller")
      .order("full_name", { ascending: true, nullsFirst: false })
      .order("email", { ascending: true });
    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const ownerDisplayName =
      String(owner?.full_name ?? "").trim() ||
      (owner?.email ? nameFromEmail(String(owner.email)) : "Dono");

    return NextResponse.json({
      ownerStaffId: (owner?.id as string | undefined) ?? null,
      ownerDisplayName,
      sellers: (sellers ?? []).map((s) => ({
        id: s.id as string,
        displayName:
          String(s.full_name ?? "").trim() ||
          nameFromEmail(String(s.email ?? "")),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
