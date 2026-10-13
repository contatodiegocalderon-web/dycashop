import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveDropMember } from "@/lib/drop-member-access";
import {
  REWARD_KIND_LABELS,
  computeRewards,
  isRewardKind,
  phoneVariants,
  type RewardClaim,
} from "@/lib/drop-rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

/** Peças e R$ dos pedidos pagos no WhatsApp da assinatura, a partir do início da assinatura. */
async function loadJourney(admin: Admin, memberId: string) {
  const { data: member, error } = await admin
    .from("drop_members")
    .select("email, whatsapp, created_at, source")
    .eq("id", memberId)
    .maybeSingle();
  if (error || !member) throw new Error(error?.message ?? "Parceiro não encontrado");

  const { data: firstPurchase } = await admin
    .from("drop_purchases")
    .select("created_at")
    .eq("email", member.email)
    .eq("status", "paid")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const since = [member.created_at as string, firstPurchase?.created_at as string | undefined]
    .filter(Boolean)
    .sort()[0]!;

  const phones = phoneVariants(member.whatsapp as string | null);
  const orders = phones.length
    ? await admin
        .from("orders")
        .select("id, display_number, sale_amount, confirmed_at")
        .eq("status", "PAGO")
        .in("customer_whatsapp", phones)
        .gte("confirmed_at", since)
        .order("confirmed_at", { ascending: false })
    : { data: [], error: null };
  if (orders.error) throw new Error(orders.error.message);

  const ids = (orders.data ?? []).map((o) => o.id as string);
  const qtyByOrder = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: items, error: iErr } = await admin
      .from("order_items")
      .select("order_id, quantity")
      .in("order_id", ids.slice(i, i + 200));
    if (iErr) throw new Error(iErr.message);
    for (const it of items ?? []) {
      const id = it.order_id as string;
      qtyByOrder.set(id, (qtyByOrder.get(id) ?? 0) + Number(it.quantity ?? 0));
    }
  }

  const list = (orders.data ?? []).map((o) => ({
    id: o.id as string,
    number: (o.display_number as number | null) ?? null,
    amount: Number(o.sale_amount ?? 0),
    pieces: qtyByOrder.get(o.id as string) ?? 0,
    confirmedAt: o.confirmed_at as string,
  }));

  const { data: claims, error: cErr } = await admin
    .from("drop_reward_claims")
    .select("id, kind, note, status, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (cErr) throw new Error(cErr.message);

  return {
    hasPhone: phones.length > 0,
    isOwner: member.source === "owner",
    since,
    pieces: list.reduce((s, o) => s + o.pieces, 0),
    spent: Math.round(list.reduce((s, o) => s + o.amount, 0) * 100) / 100,
    orders: list,
    claims: (claims ?? []) as RewardClaim[],
  };
}

export async function GET(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const j = await loadJourney(createAdminClient(), member.memberId);
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
    const j = await loadJourney(admin, member.memberId);
    const r = computeRewards(j.pieces, j.spent, j.claims);
    const allowed =
      kind === "free_piece"
        ? r.freeAvailable > 0
        : kind === "video"
          ? r.videosAvailable > 0
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
