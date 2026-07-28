import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeWhatsappDigits,
  whatsappDedupeKeys,
} from "@/lib/whatsapp-normalize";

const PAGE = 1000;

/**
 * Contagem de disparos realmente enviados (`status = sent`) por WhatsApp.
 * Só conta mensagens que saíram; pending/failed não entram.
 * O mapa inclui chaves equivalentes (com/sem 55) para lookup fácil.
 */
export async function fetchBotDispatchCountsByWhatsapp(
  admin: SupabaseClient
): Promise<Map<string, number>> {
  const byCanonical = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("crm_bot_recipients")
      .select("customer_whatsapp")
      .eq("status", "sent")
      .range(offset, offset + PAGE - 1);

    if (error) {
      const missing = /does not exist|schema cache|relation/i.test(
        error.message
      );
      if (missing) return new Map();
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Array<{ customer_whatsapp: string }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      const wa = normalizeWhatsappDigits(row.customer_whatsapp);
      if (!wa) continue;
      byCanonical.set(wa, (byCanonical.get(wa) ?? 0) + 1);
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const lookup = new Map<string, number>();
  for (const [wa, count] of Array.from(byCanonical.entries())) {
    for (const key of whatsappDedupeKeys(wa)) {
      lookup.set(key, count);
    }
  }
  return lookup;
}

export function botDispatchCountForWhatsapp(
  wa: string,
  counts: Map<string, number>
): number {
  for (const key of whatsappDedupeKeys(wa)) {
    const n = counts.get(key);
    if (n != null && n > 0) return n;
  }
  return 0;
}
