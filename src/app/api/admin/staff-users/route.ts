import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";
import type { StaffRole } from "@/lib/staff-role";

export const runtime = "nodejs";

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Dono",
  seller: "Vendedor",
  gestor: "Gestor",
};

/**
 * GET /api/admin/staff-users — lista contas da equipa (sem hash). Só dono.
 */
export async function GET(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("staff_users")
      .select("id, email, role, full_name, created_at")
      .order("role", { ascending: true })
      .order("email", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      users: (data ?? []).map((row) => {
        const role = (row.role as StaffRole) ?? "seller";
        return {
          id: row.id as string,
          email: String(row.email ?? ""),
          role,
          roleLabel: ROLE_LABEL[role] ?? role,
          fullName: String(row.full_name ?? "").trim() || null,
          createdAt: row.created_at as string | null,
        };
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/staff-users — cria conta de gestor (somente leitura: histórico e métricas).
 */
export async function POST(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  let body: { email?: string; password?: string; fullName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim() || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um email válido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 8 caracteres" },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("staff_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Já existe uma conta com este email" },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from("staff_users")
      .insert({
        email,
        password_hash: bcrypt.hashSync(password, 10),
        role: "gestor",
        full_name: fullName,
      })
      .select("id, email, role, full_name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: data.id as string,
        email: data.email as string,
        role: "gestor" as const,
        fullName: String(data.full_name ?? "").trim() || null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
