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

function paidAtFromRow(row: {
  confirmed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): string | null {
  return row.confirmed_at || row.updated_at || row.created_at || null;
}

function laterIso(a: string, b: string): string {
  const am = Date.parse(a);
  const bm = Date.parse(b);
  if (Number.isFinite(am) && Number.isFinite(bm)) return am >= bm ? a : b;
  return a >= b ? a : b;
}

/** Última compra PAGO por chave equivalente de WhatsApp (paginado). */
export async function loadLastPaidAtByWhatsapp(
  admin: Admin
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const BATCH = 500;
  let lastId: string | null = null;

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = admin
      .from("orders")
      .select("id, customer_whatsapp, confirmed_at, created_at, updated_at")
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null)
      .order("id", { ascending: true })
      .limit(BATCH);
    if (lastId) q = q.gt("id", lastId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      id: string;
      customer_whatsapp: string;
      confirmed_at?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    }>;
    if (rows.length === 0) break;

    for (const r of rows) {
      const at = paidAtFromRow(r);
      if (!at) continue;
      for (const key of whatsappDedupeKeys(r.customer_whatsapp)) {
        const cur = map.get(key);
        if (!cur) map.set(key, at);
        else map.set(key, laterIso(cur, at));
      }
    }

    lastId = rows[rows.length - 1]?.id ?? lastId;
    if (rows.length < BATCH) break;
  }

  return map;
}

function lastPaidIsoForWa(
  wa: string,
  lastPaidAtByWa: Map<string, string>
): string | null {
  let lastPaid: string | null = null;
  for (const key of whatsappDedupeKeys(wa)) {
    const t = lastPaidAtByWa.get(key);
    if (!t) continue;
    if (!lastPaid) lastPaid = t;
    else lastPaid = laterIso(lastPaid, t);
  }
  return lastPaid;
}

/**
 * Cancelamento só conta na etapa 1 se for DEPOIS da última compra.
 * Pedidos anteriores (troca de pedido / novo checkout) saem do abandonado.
 */
export function cancelledOrderQualifiesForAbandoned(
  cancelledAt: string,
  wa: string,
  lastPaidAtByWa: Map<string, string>
): boolean {
  const lastPaid = lastPaidIsoForWa(wa, lastPaidAtByWa);
  if (!lastPaid) return true;
  const cancelledMs = Date.parse(cancelledAt);
  const paidMs = Date.parse(lastPaid);
  if (Number.isFinite(cancelledMs) && Number.isFinite(paidMs)) {
    return cancelledMs > paidMs;
  }
  return cancelledAt > lastPaid;
}

export function hasOpenOrderFlag(
  wa: string,
  openOrderLookup: Set<string>
): boolean {
  return whatsappMatchesLookup(wa, openOrderLookup);
}

/**
 * Após um pedido PAGO: cancela pendentes anteriores do mesmo WhatsApp,
 * apaga CANCELADO antigos e zera follow-up da etapa 1.
 * Um carrinho novo depois desta compra volta a entrar no fluxo normal.
 */
export async function settleAbandonedAfterPaidOrder(
  admin: Admin,
  rawWa: string,
  confirmedOrderId: string
): Promise<void> {
  const keys = expandWhatsappQueryKeys([normalizeWhatsappDigits(rawWa)]);
  if (keys.length === 0) return;

  const { data: pending, error: pErr } = await admin
    .from("orders")
    .select("id")
    .eq("status", "PENDENTE_PAGAMENTO")
    .in("customer_whatsapp", keys)
    .neq("id", confirmedOrderId);

  if (pErr) throw new Error(pErr.message);

  const pendingIds = (pending ?? []).map((r) => (r as { id: string }).id);
  if (pendingIds.length > 0) {
    const { error: cErr } = await admin
      .from("orders")
      .update({
        status: "CANCELADO",
        updated_at: new Date().toISOString(),
      })
      .in("id", pendingIds);
    if (cErr) throw new Error(cErr.message);
  }

  await clearAbandonedCrmHistory(admin, rawWa);
  await purgeCancelledOrdersOnConfirm(admin, rawWa);
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

/**
 * Remove pedidos CANCELADO do cliente ao confirmar compra.
 * Etapa 1 só volta a listá-lo quando houver novo cancelamento após esta compra.
 */
export async function purgeCancelledOrdersOnConfirm(
  admin: Admin,
  rawWa: string
): Promise<number> {
  const keys = expandWhatsappQueryKeys([normalizeWhatsappDigits(rawWa)]);
  if (keys.length === 0) return 0;

  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("status", "CANCELADO")
    .in("customer_whatsapp", keys);

  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) {
    await admin.from("crm_hidden_contacts").delete().in("whatsapp_digits", keys);
    return 0;
  }

  const { error: delErr } = await admin.from("orders").delete().in("id", ids);
  if (delErr) throw new Error(delErr.message);

  await admin.from("crm_hidden_contacts").delete().in("whatsapp_digits", keys);

  return ids.length;
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
