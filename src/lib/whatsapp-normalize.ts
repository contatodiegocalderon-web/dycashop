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
