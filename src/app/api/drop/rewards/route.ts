import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveDropMember } from "@/lib/drop-member-access";
import {
  REWARD_KIND_LABELS,
  computeRewards,
  isRewardKind,
} from "@/lib/drop-rewards";
import { loadMemberJourney } from "@/lib/drop-journey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const j = await loadMemberJourney(createAdminClient(), member.memberId);
    return NextResponse.json({ ...j, orders: j.orders.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

/** Pede uma recompensa liberada (peça grátis, vídeo exclusivo, pulseira ou placa). */
export async function POST(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: { kind?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const kind = String(body.kind ?? "");
  if (!isRewardKind(kind)) return NextResponse.json({ error: "Recompensa inválida" }, { status: 400 });
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  const admin = createAdminClient();
  try {
    const j = await loadMemberJourney(admin, member.memberId);
    const r = computeRewards(j.pieces, j.spent, j.claims);
    const allowed =
      kind === "free_piece"
        ? r.freeAvailable > 0
        : kind === "video"
          ? r.canRequestVideo
          : kind === "bracelet"
            ? j.spent >= 5000 && !r.claimed("bracelet")
            : j.spent >= 10000 && !r.claimed("plaque");
    if (!allowed) {
      return NextResponse.json(
        { error: `${REWARD_KIND_LABELS[kind]} ainda não está liberado pra você.` },
        { status: 400 }
      );
    }
    const { error } = await admin
      .from("drop_reward_claims")
      .insert({ member_id: member.memberId, kind, note });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
