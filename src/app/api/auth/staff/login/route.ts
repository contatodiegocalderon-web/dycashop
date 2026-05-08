import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_COOKIE, signStaffJwt } from "@/lib/access";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const loginRlMax = Math.min(
    80,
    Math.max(8, Number(process.env.STAFF_LOGIN_RATE_LIMIT_MAX ?? "25") || 25)
  );
  const loginRlWindow = Math.min(
    3_600_000,
    Math.max(120_000, Number(process.env.STAFF_LOGIN_RATE_LIMIT_WINDOW_MS ?? "") || 900_000)
  );
  if (
    !rateLimitAllow(`login:${ip}`, "staff_login", {
      max: loginRlMax,
      windowMs: loginRlWindow,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Muitas tentativas de login a partir desta rede. Aguarde alguns minutos.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(loginRlWindow / 1000)) },
      }
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
    .from("staff_users")
    .select("id, email, password_hash, role")
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

  const role = row.role === "seller" || row.role === "owner" ? row.role : "seller";
  const token = await signStaffJwt({
    staffId: row.id as string,
    email: row.email as string,
    role,
  });

  const res = NextResponse.json({
    ok: true,
    email: row.email,
    role,
  });
  res.cookies.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
