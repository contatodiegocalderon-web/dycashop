import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";

export const runtime = "nodejs";

function normalizeWhatsAppDigits(input: string): string {
  const raw = String(input ?? "").replace(/\D/g, "");
  if (!raw) return "";
  return raw.startsWith("55") ? raw : `55${raw}`;
}

/**
 * GET /api/orders/lookup-customer-name?whatsapp=5511999999999
 * Devolve o último nome de cliente associado a esse número em pedido pendente ou pago (catálogo público).
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (
    !rateLimitAllow(`lookup:${ip}`, "orders_lookup_name", {
      max: 60,
      windowMs: 900_000,
    })
  ) {
    return NextResponse.json(
      { error: "Demasiadas tentativas. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  const digits = normalizeWhatsAppDigits(
    new URL(request.url).searchParams.get("whatsapp") ?? ""
  );
  if (digits.length < 10) {
    return NextResponse.json({ customerName: null as string | null });
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("orders")
      .select("customer_name, updated_at")
      .eq("customer_whatsapp", digits)
      .in("status", ["PENDENTE_PAGAMENTO", "PAGO"])
      .order("updated_at", { ascending: false })
      .limit(8);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const name =
      (rows ?? []).map((r) => String(r.customer_name ?? "").trim()).find((n) => n.length > 0) ??
      null;

    return NextResponse.json({ customerName: name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
