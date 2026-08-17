import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import {
  expandWhatsappQueryKeys,
  normalizeWhatsappDigits,
} from "@/lib/whatsapp-normalize";
import type { CustomerSegment } from "@/types";

export const runtime = "nodejs";

/**
 * GET /api/admin/clients/lookup-segment?whatsapp=5511999999999&excludeOrderId=uuid
 * Sugere NOVO ou ANTIGO com base em pedidos PAGO anteriores do mesmo WhatsApp.
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

  const params = request.nextUrl.searchParams;
  const digits = normalizeWhatsappDigits(params.get("whatsapp") ?? "");
  const excludeOrderId = params.get("excludeOrderId")?.trim() || null;

  if (digits.length < 10) {
    return NextResponse.json({ customerSegment: "NOVO" as CustomerSegment });
  }

  try {
    const keys = expandWhatsappQueryKeys([digits]);
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("orders")
      .select("id")
      .in("customer_whatsapp", keys)
      .eq("status", "PAGO")
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const paidCount = (rows ?? []).filter(
      (r) => !excludeOrderId || r.id !== excludeOrderId
    ).length;

    const customerSegment: CustomerSegment =
      paidCount > 0 ? "ANTIGO" : "NOVO";

    return NextResponse.json({ customerSegment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
