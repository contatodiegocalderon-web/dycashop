import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (
    !rateLimitAllow(`drop-access:${ip}`, "drop_access", {
      max: 8,
      windowMs: 3_600_000,
    })
  ) {
    return NextResponse.json(
      { error: "Muitos pedidos. Aguarde um pouco e tente de novo." },
      { status: 429 }
    );
  }

  let body: { fullName?: string; email?: string; whatsapp?: string };
  try {
    body = (await request.json()) as {
      fullName?: string;
      email?: string;
      whatsapp?: string;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const whatsapp = normalizeWhatsappDigits(String(body.whatsapp ?? ""));

  if (fullName.length < 2 || !email.includes("@") || whatsapp.length < 12) {
    return NextResponse.json(
      { error: "Preencha nome, email e WhatsApp válidos." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("drop_access_requests").insert({
    full_name: fullName,
    email,
    whatsapp,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
