import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseLegacySpreadsheetRows,
  SITE_VAREJO_SELLER,
  type LegacyImportStats,
  type LegacySpreadsheetRow,
} from "@/lib/crm-legacy-import";
import { normalizeWhatsappDigits, whatsappDedupeKeys } from "@/lib/whatsapp-normalize";

const PAGE = 1000;

type WaOrderState = {
  paidCount: number;
  legacyPaidCount: number;
  realPaidCount: number;
  pendingCount: number;
};

async function fetchOrderStateByWa(
  admin: SupabaseClient
): Promise<Map<string, WaOrderState>> {
  const map = new Map<string, WaOrderState>();
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("orders")
      .select("customer_whatsapp, status, legacy_import")
      .not("customer_whatsapp", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    for (const raw of chunk) {
      const row = raw as {
        customer_whatsapp: string;
        status: string;
        legacy_import?: boolean;
      };
      const wa = normalizeWhatsappDigits(row.customer_whatsapp);
      if (wa.length < 12) continue;

      const cur = map.get(wa) ?? {
        paidCount: 0,
        legacyPaidCount: 0,
        realPaidCount: 0,
        pendingCount: 0,
      };

      if (row.status === "PAGO") {
        cur.paidCount += 1;
        if (row.legacy_import) cur.legacyPaidCount += 1;
        else cur.realPaidCount += 1;
      } else if (
        row.status === "PENDENTE_PAGAMENTO" ||
        row.status === "CANCELADO"
      ) {
        cur.pendingCount += 1;
      }

      map.set(wa, cur);
    }
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  return map;
}

function stateForWa(
  wa: string,
  state: Map<string, WaOrderState>
): WaOrderState {
  for (const k of whatsappDedupeKeys(wa)) {
    const s = state.get(k);
    if (s) return s;
  }
  return {
    paidCount: 0,
    legacyPaidCount: 0,
    realPaidCount: 0,
    pendingCount: 0,
  };
}

function bumpState(
  state: Map<string, WaOrderState>,
  wa: string,
  patch: Partial<WaOrderState>
) {
  const keys = whatsappDedupeKeys(wa);
  const cur = stateForWa(wa, state);
  const next = { ...cur, ...patch };
  for (const k of keys) state.set(k, next);
}

async function deleteLegacyPaidForWa(
  admin: SupabaseClient,
  wa: string
): Promise<number> {
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("customer_whatsapp", wa)
    .eq("status", "PAGO")
    .eq("legacy_import", true);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return 0;
  const { error: delErr } = await admin.from("orders").delete().in("id", ids);
  if (delErr) throw new Error(delErr.message);
  return ids.length;
}

async function insertRegistered(
  admin: SupabaseClient,
  row: LegacySpreadsheetRow
): Promise<void> {
  const payload = {
    status: "PAGO" as const,
    customer_name: row.name,
    customer_whatsapp: row.whatsapp,
    customer_segment: "ANTIGO" as const,
    sale_amount: row.lastOrderValue,
    confirmed_at: row.createdAtIso,
    created_at: row.createdAtIso,
    confirmed_by_staff_id: null,
    requested_seller_name: "?",
    legacy_import: true,
  };

  let { error } = await admin.from("orders").insert(payload);
  if (error && /legacy_import|column/i.test(error.message)) {
    ({ error } = await admin.from("orders").insert({
      status: payload.status,
      customer_name: payload.customer_name,
      customer_whatsapp: payload.customer_whatsapp,
      customer_segment: payload.customer_segment,
      sale_amount: payload.sale_amount,
      confirmed_at: payload.confirmed_at,
      confirmed_by_staff_id: payload.confirmed_by_staff_id,
      requested_seller_name: payload.requested_seller_name,
    }));
  }
  if (error) throw new Error(error.message);

  const { error: pErr } = await admin.from("crm_client_profiles").upsert(
    {
      whatsapp_digits: row.whatsapp,
      business_profile: "uso_proprio",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "whatsapp_digits" }
  );
  if (pErr) {
    const missing = /does not exist|schema cache|relation/i.test(pErr.message);
    if (!missing) throw new Error(pErr.message);
  }
}

async function insertAbandoned(
  admin: SupabaseClient,
  row: LegacySpreadsheetRow
): Promise<void> {
  const payload = {
    status: "PENDENTE_PAGAMENTO" as const,
    customer_name: row.name,
    customer_whatsapp: row.whatsapp,
    requested_seller_name: SITE_VAREJO_SELLER,
    created_at: row.createdAtIso,
    legacy_import: true,
  };

  let { error } = await admin.from("orders").insert(payload);
  if (error && /legacy_import|column/i.test(error.message)) {
    ({ error } = await admin.from("orders").insert({
      status: payload.status,
      customer_name: payload.customer_name,
      customer_whatsapp: payload.customer_whatsapp,
      requested_seller_name: payload.requested_seller_name,
      created_at: payload.created_at,
    }));
  }
  if (error) throw new Error(error.message);
}

export async function importLegacyClients(
  admin: SupabaseClient,
  sheetRows: Record<string, unknown>[]
): Promise<LegacyImportStats> {
  const { parsed, skippedInvalid } = parseLegacySpreadsheetRows(sheetRows);
  const state = await fetchOrderStateByWa(admin);

  const toProcess: LegacySpreadsheetRow[] = [];
  const seenInFile = new Set<string>();
  let skippedDuplicateInFile = 0;

  for (const row of parsed) {
    const keys = whatsappDedupeKeys(row.whatsapp);
    if (keys.some((k) => seenInFile.has(k))) {
      skippedDuplicateInFile += 1;
      continue;
    }
    for (const k of keys) seenInFile.add(k);
    toProcess.push(row);
  }

  const stats: LegacyImportStats = {
    rowsRead: sheetRows.length,
    valid: parsed.length,
    registered: 0,
    abandoned: 0,
    skippedExisting: 0,
    skippedDuplicateInFile,
    skippedInvalid,
    ordersCreated: 0,
    reconciledToAbandoned: 0,
    byProfile: { lojista: 0, revendedor: 0, uso_proprio: 0 },
  };

  for (const row of toProcess) {
    const s = stateForWa(row.whatsapp, state);
    const hasValor = row.lastOrderValue != null && row.lastOrderValue > 0;

    if (hasValor) {
      if (s.realPaidCount > 0 || (s.paidCount > 0 && s.legacyPaidCount < s.paidCount)) {
        stats.skippedExisting += 1;
        continue;
      }
      if (s.paidCount > 0 && s.legacyPaidCount === s.paidCount) {
        await deleteLegacyPaidForWa(admin, row.whatsapp);
        bumpState(state, row.whatsapp, {
          paidCount: 0,
          legacyPaidCount: 0,
        });
      }
      if (s.pendingCount > 0) {
        const { error: delErr } = await admin
          .from("orders")
          .delete()
          .eq("customer_whatsapp", row.whatsapp)
          .in("status", ["PENDENTE_PAGAMENTO", "CANCELADO"]);
        if (delErr) throw new Error(delErr.message);
        bumpState(state, row.whatsapp, { pendingCount: 0 });
      }

      await insertRegistered(admin, row);
      stats.registered += 1;
      stats.ordersCreated += 1;
      stats.byProfile.uso_proprio += 1;
      bumpState(state, row.whatsapp, {
        paidCount: 1,
        legacyPaidCount: 1,
        realPaidCount: 0,
      });
      continue;
    }

    if (s.realPaidCount > 0) {
      stats.skippedExisting += 1;
      continue;
    }

    if (s.paidCount > 0 && s.legacyPaidCount === s.paidCount) {
      const removed = await deleteLegacyPaidForWa(admin, row.whatsapp);
      if (removed > 0) stats.reconciledToAbandoned += 1;
      bumpState(state, row.whatsapp, {
        paidCount: 0,
        legacyPaidCount: 0,
      });
    }

    if (s.pendingCount > 0) {
      stats.skippedExisting += 1;
      continue;
    }

    await insertAbandoned(admin, row);
    stats.abandoned += 1;
    stats.ordersCreated += 1;
    bumpState(state, row.whatsapp, { pendingCount: 1 });
  }

  return stats;
}
