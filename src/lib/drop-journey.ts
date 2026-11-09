import { createAdminClient } from "@/lib/supabase/admin";
import { phoneVariants, type RewardClaim } from "@/lib/drop-rewards";

type Admin = ReturnType<typeof createAdminClient>;

/** Peças e R$ dos pedidos pagos no WhatsApp da assinatura, a partir do início da assinatura. */
export async function loadMemberJourney(admin: Admin, memberId: string) {
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
  const subscribedAt =
    (firstPurchase?.created_at as string | undefined) ?? (member.created_at as string);
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

  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const today = list.filter(
    (o) =>
      new Date(o.confirmedAt).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === todayKey
  );

  return {
    hasPhone: phones.length > 0,
    isOwner: member.source === "owner",
    since,
    subscribedAt,
    hasSubscription: Boolean(firstPurchase?.created_at),
    pieces: list.reduce((s, o) => s + o.pieces, 0),
    spent: Math.round(list.reduce((s, o) => s + o.amount, 0) * 100) / 100,
    todayPieces: today.reduce((s, o) => s + o.pieces, 0),
    todaySpent: Math.round(today.reduce((s, o) => s + o.amount, 0) * 100) / 100,
    orders: list,
    claims: (claims ?? []) as RewardClaim[],
  };
}
