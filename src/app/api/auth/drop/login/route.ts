import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DROP_MEMBER_COOKIE,
  signDropMemberJwt,
} from "@/lib/drop-member-access";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (
    !rateLimitAllow(`drop-login:${ip}`, "drop_login", {
      max: 20,
      windowMs: 900_000,
    })
  ) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email e senha são obrigatórios" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("drop_members")
    .select("id, email, password_hash, full_name, active")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hash = row?.password_hash as string | undefined;
  const ok = hash && bcrypt.compareSync(password, hash);
  if (!row || !ok) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }
  if (row.active === false) {
    return NextResponse.json(
      { error: "Acesso desativado. Fale com a equipe DYCASHOP." },
      { status: 403 }
    );
  }

  const token = await signDropMemberJwt({
    memberId: row.id as string,
    email: row.email as string,
    fullName: (row.full_name as string | null) ?? null,
  });

  const res = NextResponse.json({
    ok: true,
    email: row.email,
    fullName: row.full_name,
  });
  res.cookies.set(DROP_MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
