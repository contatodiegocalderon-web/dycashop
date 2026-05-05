import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";

export const runtime = "nodejs";

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

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ orders: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
