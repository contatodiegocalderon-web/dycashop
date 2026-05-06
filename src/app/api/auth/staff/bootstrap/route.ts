import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiKeyMatches } from "@/lib/access";

export const runtime = "nodejs";

/**
 * POST /api/auth/staff/bootstrap
 * Cria as primeiras contas da equipa. Exige cabeçalho x-admin-key = ADMIN_API_SECRET.
 * Corpo:
 *  - novo formato: { users: [{ email, password, role, fullName? }] }
 *  - legado: { owner: { email, password }, seller: { email, password } }
 */
export async function POST(request: NextRequest) {
  if (!apiKeyMatches(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body:
    | {
        users?: Array<{
          email?: string;
          password?: string;
          role?: "owner" | "seller";
          fullName?: string;
        }>;
      }
    | {
        owner?: { email?: string; password?: string; fullName?: string };
        seller?: { email?: string; password?: string; fullName?: string };
      };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const usersInput =
    "users" in body && Array.isArray(body.users) && body.users.length > 0
      ? body.users
      : [
          {
            email: body.owner?.email,
            password: body.owner?.password,
            role: "owner" as const,
            fullName: body.owner?.fullName,
          },
          {
            email: body.seller?.email,
            password: body.seller?.password,
            role: "seller" as const,
            fullName: body.seller?.fullName,
          },
        ];

  const normalizedUsers = usersInput.map((u) => ({
    email: String(u.email ?? "")
      .trim()
      .toLowerCase(),
    password: String(u.password ?? ""),
    role: u.role === "owner" ? "owner" : "seller",
    full_name: String(u.fullName ?? "").trim() || null,
  }));

  if (
    normalizedUsers.length === 0 ||
    normalizedUsers.some((u) => !u.email || !u.password)
  ) {
    return NextResponse.json(
      { error: "Informe utilizadores com email e senha válidos." },
      { status: 400 }
    );
  }
  const uniqueEmails = new Set(normalizedUsers.map((u) => u.email));
  if (uniqueEmails.size !== normalizedUsers.length) {
    return NextResponse.json(
      { error: "Há emails duplicados na lista de utilizadores." },
      { status: 400 }
    );
  }
  if (!normalizedUsers.some((u) => u.role === "owner")) {
    return NextResponse.json(
      { error: "Inclua ao menos 1 conta com role=owner." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("staff_users")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Já existem utilizadores em staff_users. Remova manualmente ou use outra base.",
      },
      { status: 400 }
    );
  }

  const rounds = 10;
  const ins = await admin.from("staff_users").insert(
    normalizedUsers.map((u) => ({
      email: u.email,
      password_hash: bcrypt.hashSync(u.password, rounds),
      role: u.role,
      full_name: u.full_name,
    }))
  );

  if (ins.error) {
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: normalizedUsers.length });
}
