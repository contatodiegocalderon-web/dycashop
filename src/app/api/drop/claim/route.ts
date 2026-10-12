import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DROP_MEMBER_COOKIE,
  signDropMemberJwt,
} from "@/lib/drop-member-access";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

function samePhone(a: string, b: string): boolean {
  const tail = (s: string) => s.replace(/\D/g, "").slice(-8);
  return tail(a).length === 8 && tail(a) === tail(b);
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (
    !rateLimitAllow(`drop-claim:${ip}`, "drop_claim", {
      max: 10,
      windowMs: 900_000,
    })
  ) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  let body: { email?: string; phone?: string; password?: string; fullName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const phone = normalizeWhatsappDigits(String(body.phone ?? ""));
  const password = String(body.password ?? "");

  if (!email.includes("@") || phone.length < 12) {
    return NextResponse.json(
      { error: "Informe o email e o celular usados na compra." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha precisa ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: purchases, error: pErr } = await admin
    .from("drop_purchases")
    .select("subscription_id, full_name, phone_digits, status, updated_at")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const latest = purchases?.[0];
  if (!latest) {
    return NextResponse.json(
      {
        error:
          "Não encontramos uma compra com esse email. Use o mesmo email da Kiwify — se acabou de pagar, aguarde 1 minuto e tente de novo.",
      },
      { status: 404 }
    );
  }
  if (latest.status !== "paid") {
    return NextResponse.json(
      {
        error:
          "Essa assinatura não está ativa (pagamento pendente, cancelado ou reembolsado). Fale com a equipe DYCASHOP.",
      },
      { status: 403 }
    );
  }
  const matched = (purchases ?? []).some(
    (p) => p.status === "paid" && p.phone_digits && samePhone(p.phone_digits, phone)
  );
  if (!matched) {
    return NextResponse.json(
      { error: "O celular não confere com o da compra. Use o mesmo número informado na Kiwify." },
      { status: 403 }
    );
  }

  const { data: existing } = await admin
    .from("drop_members")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error:
          "Você já criou seu acesso. Entre com seu email e senha em \"Já sou parceiro\". Esqueceu a senha? Fale com a equipe.",
      },
      { status: 409 }
    );
  }

  const fullName =
    String(body.fullName ?? "").trim() || latest.full_name?.trim() || null;

  const { data: member, error: mErr } = await admin
    .from("drop_members")
    .insert({
      email,
      password_hash: bcrypt.hashSync(password, 10),
      full_name: fullName,
      whatsapp: phone,
      active: true,
      source: "kiwify",
      kiwify_subscription_id: latest.subscription_id ?? null,
    })
    .select("id, email, full_name")
    .single();
  if (mErr || !member) {
    return NextResponse.json(
      { error: mErr?.message ?? "Falha ao criar acesso" },
      { status: 500 }
    );
  }

  const token = await signDropMemberJwt({
    memberId: member.id as string,
    email: member.email as string,
    fullName: (member.full_name as string | null) ?? null,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DROP_MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
