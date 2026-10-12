import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { generateDropPassword } from "@/lib/drop-member-access";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

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

  const admin = createAdminClient();
  const [{ data: members, error: mErr }, { data: requests, error: rErr }] =
    await Promise.all([
      admin
        .from("drop_members")
        .select("id, email, full_name, whatsapp, active, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("drop_access_requests")
        .select("id, full_name, email, whatsapp, status, created_at")
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  return NextResponse.json({ members: members ?? [], requests: requests ?? [] });
}

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

  let body: {
    email?: string;
    fullName?: string;
    whatsapp?: string;
    password?: string;
    requestId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(body.fullName ?? "").trim() || null;
  const whatsapp = body.whatsapp
    ? normalizeWhatsappDigits(String(body.whatsapp))
    : null;
  const password =
    String(body.password ?? "").trim() || generateDropPassword(10);

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Senha precisa ter pelo menos 6 caracteres" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("drop_members")
    .insert({
      email,
      password_hash: bcrypt.hashSync(password, 10),
      full_name: fullName,
      whatsapp,
      active: true,
    })
    .select("id, email, full_name, whatsapp, active, created_at")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { error: "Já existe um membro com este email." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requestId = String(body.requestId ?? "").trim();
  if (requestId) {
    await admin
      .from("drop_access_requests")
      .update({ status: "approved" })
      .eq("id", requestId);
  }

  return NextResponse.json({
    member: data,
    password,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  let body: {
    id?: string;
    active?: boolean;
    resetPassword?: boolean;
    requestId?: string;
    requestStatus?: "rejected";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (body.requestId && body.requestStatus === "rejected") {
    const { error } = await admin
      .from("drop_access_requests")
      .update({ status: "rejected" })
      .eq("id", body.requestId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  if (body.resetPassword) {
    const password = generateDropPassword(10);
    const { error } = await admin
      .from("drop_members")
      .update({ password_hash: bcrypt.hashSync(password, 10) })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, password });
  }

  if (typeof body.active === "boolean") {
    const { error } = await admin
      .from("drop_members")
      .update({ active: body.active })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
}
