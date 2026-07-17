import type { createAdminClient } from "@/lib/supabase/admin";
import { excludeCrmRemarketingFromOrdersQuery } from "@/lib/crm-legacy-import";
import {
  buildWhatsappLookup,
  expandWhatsappQueryKeys,
  normalizeWhatsappDigits,
  whatsappDedupeKeys,
  whatsappMatchesLookup,
} from "@/lib/whatsapp-normalize";

type Admin = ReturnType<typeof createAdminClient>;

/** WhatsApps com pedido em aberto (PENDENTE), excl. remarketing da planilha. */
export async function loadOpenOrderWhatsappLookup(
  admin: Admin
): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin
    .from("orders")
    .select("customer_whatsapp")
    .eq("status", "PENDENTE_PAGAMENTO")
    .not("customer_whatsapp", "is", null)
    .limit(5000);

  q = excludeCrmRemarketingFromOrdersQuery(q);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return buildWhatsappLookup(
    (data ?? []) as Array<{ customer_whatsapp: string }>
  );
}

/** Última confirmação (PAGO) por chave equivalente de WhatsApp. */
export async function loadLastPaidAtByWhatsapp(
  admin: Admin
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("orders")
    .select("customer_whatsapp, confirmed_at")
    .eq("status", "PAGO")
    .not("customer_whatsapp", "is", null)
    .not("confirmed_at", "is", null)
    .limit(10000);

  if (error) throw new Error(error.message);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { customer_whatsapp: string; confirmed_at: string };
    const at = r.confirmed_at;
    if (!at) continue;
    for (const key of whatsappDedupeKeys(r.customer_whatsapp)) {
      const cur = map.get(key);
      if (!cur || at > cur) map.set(key, at);
    }
  }
  return map;
}

/** Cancelamento conta só se for posterior à última compra confirmada. */
export function cancelledOrderQualifiesForAbandoned(
  cancelledAt: string,
  wa: string,
  lastPaidAtByWa: Map<string, string>
): boolean {
  let lastPaid: string | null = null;
  for (const key of whatsappDedupeKeys(wa)) {
    const t = lastPaidAtByWa.get(key);
    if (t && (!lastPaid || t > lastPaid)) lastPaid = t;
  }
  if (!lastPaid) return true;
  return cancelledAt > lastPaid;
}

export function hasOpenOrderFlag(
  wa: string,
  openOrderLookup: Set<string>
): boolean {
  return whatsappMatchesLookup(wa, openOrderLookup);
}

/** Limpa follow-ups e cliques de abandonado após confirmação de compra. */
export async function clearAbandonedCrmHistory(
  admin: Admin,
  rawWa: string
): Promise<void> {
  const keys = expandWhatsappQueryKeys([normalizeWhatsappDigits(rawWa)]);
  if (keys.length === 0) return;

  await admin
    .from("crm_abandoned_follow_ups")
    .delete()
    .in("whatsapp_digits", keys);
  await admin
    .from("crm_abandoned_whatsapp_clicks")
    .delete()
    .in("whatsapp_digits", keys);
}

/** Oculta lead da etapa 1 (crm_hidden_contacts). */
export async function hideAbandonedContact(
  admin: Admin,
  rawWa: string
): Promise<void> {
  const wa = normalizeWhatsappDigits(rawWa);
  if (wa.length < 10) throw new Error("WhatsApp inválido.");
  const { error } = await admin
    .from("crm_hidden_contacts")
    .upsert({ whatsapp_digits: wa }, { onConflict: "whatsapp_digits" });
  if (error) throw new Error(error.message);
}
