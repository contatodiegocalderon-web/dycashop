import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(request: NextRequest): Promise<NextResponse | null> {
  try {
    await assertOwnerAccess(request);
    return null;
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status });
  }
}

/** Pedidos de recompensa dos parceiros (pendentes primeiro). */
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const { data, error } = await createAdminClient()
    .from("drop_reward_claims")
    .select("id, kind, note, status, created_at, done_at, drop_members(full_name, email, whatsapp)")
    .order("status", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  let body: { id?: string; done?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const done = body.done !== false;
  const { error } = await createAdminClient()
    .from("drop_reward_claims")
    .update({ status: done ? "done" : "pending", done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
