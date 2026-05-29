import type { BusinessProfile } from "@/lib/client-follow-up";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const SITE_VAREJO_SELLER = "SITE-VAREJO";

export type LegacySpreadsheetRow = {
  name: string;
  whatsapp: string;
  createdAtIso: string;
  /** null = carrinho abandonado (sem valor_ultimo_pedido) */
  lastOrderValue: number | null;
};

export type LegacyImportStats = {
  rowsRead: number;
  valid: number;
  registered: number;
  abandoned: number;
  skippedExisting: number;
  skippedDuplicateInFile: number;
  skippedInvalid: number;
  ordersCreated: number;
  reconciledToAbandoned: number;
  byProfile: Record<BusinessProfile, number>;
};

const CLT_PREFIX = /^CLT\s+/i;

export function cleanLegacyClientName(raw: string): string {
  return String(raw ?? "")
    .replace(CLT_PREFIX, "")
    .replace(/\bCLT\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** DD/MM/YYYY HH:mm:ss ou DD/MM/YYYY */
export function parseLegacyBrazilDate(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const m = t.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const h = Number(m[4] ?? 12);
  const min = Number(m[5] ?? 0);
  const sec = Number(m[6] ?? 0);
  const d = new Date(year, month, day, h, min, sec);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

/** Valor monetário BR (ex. 62,83) ou vazio → null (abandonado). */
export function parseLegacyMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? Number(raw.toFixed(2)) : null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

/** Planilha Dyca: nome, telefone_com_ddd, criado_em, valor_ultimo_pedido. */
export function parseLegacySpreadsheetRows(
  rows: Record<string, unknown>[]
): { parsed: LegacySpreadsheetRow[]; skippedInvalid: number } {
  const parsed: LegacySpreadsheetRow[] = [];
  let skippedInvalid = 0;

  for (const row of rows) {
    const name = cleanLegacyClientName(String(pick(row, "nome", "Nome") ?? ""));
    const wa = normalizeWhatsappDigits(
      String(pick(row, "telefone_com_ddd", "Telefone_com_ddd", "Celular", "celular") ?? "")
    );
    const dateRaw = String(pick(row, "criado_em", "Criado_em", "criado em") ?? "");
    const lastOrderValue = parseLegacyMoney(
      pick(row, "valor_ultimo_pedido", "Valor_ultimo_pedido")
    );

    if (!wa || wa.length < 12 || !name) {
      skippedInvalid += 1;
      continue;
    }

    const createdAtIso =
      parseLegacyBrazilDate(dateRaw) ?? new Date(2019, 0, 1).toISOString();

    parsed.push({
      name,
      whatsapp: wa,
      createdAtIso,
      lastOrderValue,
    });
  }

  return { parsed, skippedInvalid };
}
