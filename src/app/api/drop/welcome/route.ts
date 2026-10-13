import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveDropMember } from "@/lib/drop-member-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marca que o membro já viu o vídeo de boas-vindas na primeira entrada. */
export async function POST(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { error } = await createAdminClient()
    .from("drop_members")
    .update({ welcome_seen_at: new Date().toISOString() })
    .eq("id", member.memberId)
    .is("welcome_seen_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
