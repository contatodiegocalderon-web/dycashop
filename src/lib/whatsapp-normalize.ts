/** Normaliza WhatsApp para dígitos com prefixo 55 (padrão do catálogo). */
export function normalizeWhatsappDigits(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  if (d.length >= 12) return d.startsWith("55") ? d : `55${d}`;
  return d;
}

/** Chaves equivalentes para deduplicação (com/sem 55). */
export function whatsappDedupeKeys(digits: string): string[] {
  const d = normalizeWhatsappDigits(digits);
  if (!d) return [];
  const keys = new Set<string>([d]);
  if (d.startsWith("55") && d.length > 12) keys.add(d.slice(2));
  if (!d.startsWith("55") && d.length >= 10) keys.add(`55${d}`);
  return Array.from(keys);
}

/** Índice de WhatsApps já vistos (todas as chaves equivalentes). */
export function buildWhatsappLookup(rows: Array<{ customer_whatsapp: string }>): Set<string> {
  const lookup = new Set<string>();
  for (const row of rows) {
    for (const key of whatsappDedupeKeys(row.customer_whatsapp)) {
      lookup.add(key);
    }
  }
  return lookup;
}

export function whatsappMatchesLookup(wa: string, lookup: Set<string>): boolean {
  return whatsappDedupeKeys(wa).some((key) => lookup.has(key));
}

export function lookupWhatsappMapValue<T>(
  wa: string,
  map: Map<string, T>
): T | undefined {
  for (const key of whatsappDedupeKeys(wa)) {
    const value = map.get(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Todas as chaves equivalentes para consulta em lote (ex.: perfis CRM). */
export function expandWhatsappQueryKeys(waList: string[]): string[] {
  const keys = new Set<string>();
  for (const wa of waList) {
    for (const key of whatsappDedupeKeys(wa)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}
