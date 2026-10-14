import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneVariants } from "@/lib/drop-rewards";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Carrinho: diz só se o WhatsApp é de um membro ativo da comunidade. */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (
    !rateLimitAllow(`drop-member-check:${ip}`, "drop_member_check", {
      max: 30,
      windowMs: 600_000,
    })
  ) {
    return NextResponse.json({ member: false }, { status: 429 });
  }

  const digits = normalizeWhatsappDigits(request.nextUrl.searchParams.get("whatsapp") ?? "");
  if (digits.length < 12) return NextResponse.json({ member: false });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("drop_members")
    .select("id")
    .eq("active", true)
    .in("whatsapp", phoneVariants(digits))
    .limit(1);
  if (error) return NextResponse.json({ member: false }, { status: 500 });

  return NextResponse.json({ member: (data ?? []).length > 0 });
}
