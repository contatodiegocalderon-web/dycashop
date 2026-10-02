import { isAdminKitDriveId, isKitsCategory } from "@/lib/kits-category";

export type KitPieceLine = { category: string; qty: number };

type PieceRule = { test: RegExp; category: string };

/** Ordem importa: regras mais específicas primeiro. */
const PIECE_RULES: PieceRule[] = [
  { test: /conjunto/, category: "CONJUNTO DRYFIT FRIO" },
  { test: /dry[\s-]?fit/, category: "CAMISETA DRY-FIT" },
  { test: /moletom/, category: "BLUSA MOLETOM" },
  { test: /calca/, category: "CALÇAS ELASTANO" },
  { test: /bermuda/, category: "BERMUDAS ELASTANO" },
  { test: /camiseta/, category: "CAMISETAS STREETWEAR" },
  { test: /jeans/, category: "JEANS" },
  { test: /\btenis\b/, category: "TÊNIS" },
];

function fold(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchPieceCategory(label: string): string | null {
  const key = fold(label);
  if (!key || /^pecas?$/.test(key)) return null;
  for (const rule of PIECE_RULES) {
    if (rule.test.test(key)) return rule.category;
  }
  return null;
}

function lookupCost(costs: Record<string, number>, label: string): number {
  if (Object.prototype.hasOwnProperty.call(costs, label)) {
    const direct = Number(costs[label]);
    if (Number.isFinite(direct)) return direct;
  }
  const key = fold(label);
  if (Object.prototype.hasOwnProperty.call(costs, key)) {
    const norm = Number(costs[key]);
    if (Number.isFinite(norm)) return norm;
  }
  for (const [k, v] of Object.entries(costs)) {
    if (fold(k) === key) {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

/**
 * Lê a composição no título do kit.
 * "5 BERMUDAS + 5 CAMISETAS" → 5 + 5.
 * "KIT BERMUDAS ELASTANO" + "10 PEÇAS" → 10 bermudas.
 */
export function parseKitPieceLines(
  brand: string | null | undefined,
  color: string | null | undefined
): KitPieceLine[] | null {
  const text = fold(`${brand ?? ""} ${color ?? ""}`);
  if (!text) return null;

  const components: KitPieceLine[] = [];
  let pieceTotal: number | null = null;
  const re = /(\d+)\s+([a-z]+(?:\s+[a-z-]+){0,4})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const qty = Number(match[1]);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const label = match[2] ?? "";
    if (/^pecas?$/.test(fold(label))) {
      pieceTotal = qty;
      continue;
    }
    const category = matchPieceCategory(label);
    if (!category) continue;
    components.push({ category, qty });
  }

  if (components.length > 0) {
    const merged = new Map<string, number>();
    for (const line of components) {
      merged.set(line.category, (merged.get(line.category) ?? 0) + line.qty);
    }
    return Array.from(merged, ([category, qty]) => ({ category, qty }));
  }

  if (pieceTotal == null) return null;
  const category = matchPieceCategory(text);
  if (!category) return null;
  return [{ category, qty: pieceTotal }];
}

export function isReadyMadeKitSnapshot(item: {
  snapshot_category?: string | null;
  snapshot_drive_file_id?: string | null;
}): boolean {
  return (
    isKitsCategory(item.snapshot_category) ||
    isAdminKitDriveId(item.snapshot_drive_file_id)
  );
}

/**
 * Custo da linha = (soma das peças × custo da categoria) × quantidade de kits.
 * Retorna null quando a linha não é um kit pronto.
 */
export function readyKitLineCost(
  item: {
    quantity: number;
    snapshot_category?: string | null;
    snapshot_brand?: string | null;
    snapshot_color?: string | null;
    snapshot_drive_file_id?: string | null;
  },
  costs: Record<string, number>
): number | null {
  if (!isReadyMadeKitSnapshot(item)) return null;
  const lines = parseKitPieceLines(item.snapshot_brand, item.snapshot_color);
  if (!lines || lines.length === 0) return null;
  const kits = Math.max(0, Number(item.quantity) || 0);
  let perKit = 0;
  for (const line of lines) {
    perKit += line.qty * lookupCost(costs, line.category);
  }
  return Number((perKit * kits).toFixed(2));
}
