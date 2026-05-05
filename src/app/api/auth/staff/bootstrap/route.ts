import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiKeyMatches } from "@/lib/access";

export const runtime = "nodejs";

/**
 * POST /api/auth/staff/bootstrap
 * Cria as primeiras contas (dono + vendedor). Exige cabeçalho x-admin-key = ADMIN_API_SECRET.
 * Corpo: { owner: { email, password }, seller: { email, password } }
 */
export async function POST(request: NextRequest) {
  if (!apiKeyMatches(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: {
    owner?: { email?: string; password?: string };
    seller?: { email?: string; password?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ownerEmail = String(body.owner?.email ?? "")
    .trim()
    .toLowerCase();
  const ownerPass = String(body.owner?.password ?? "");
  const sellerEmail = String(body.seller?.email ?? "")
    .trim()
    .toLowerCase();
  const sellerPass = String(body.seller?.password ?? "");

  if (
    !ownerEmail ||
    !ownerPass ||
    !sellerEmail ||
    !sellerPass ||
    ownerEmail === sellerEmail
  ) {
    return NextResponse.json(
      {
        error:
          "Informe owner e seller com emails distintos e senhas (JSON: owner, seller).",
      },
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
  const ins = await admin.from("staff_users").insert([
    {
      email: ownerEmail,
      password_hash: bcrypt.hashSync(ownerPass, rounds),
      role: "owner",
    },
    {
      email: sellerEmail,
      password_hash: bcrypt.hashSync(sellerPass, rounds),
      role: "seller",
    },
  ]);

  if (ins.error) {
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: 2 });
}
