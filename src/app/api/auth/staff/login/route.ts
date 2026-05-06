import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_COOKIE, signStaffJwt } from "@/lib/access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
