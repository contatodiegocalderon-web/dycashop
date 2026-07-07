import type { CartLine } from "@/types";

export function normalizeCategoryLabel(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  return s !== "" ? s : "Sem categoria";
}

export function normalizeCepDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 8) return null;
  return d;
}

export function formatCepDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 8) return digits;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export type CategoryWeightMap = Record<string, number>;

export function defaultWeightGramsFromEnv(): number {
  const raw = process.env.DEFAULT_CATEGORY_WEIGHT_GRAMS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 250;
  return Number.isFinite(n) && n > 0 ? n : 250;
}

/** Soma gramas: peso da categoria × quantidade de cada linha. */
export function totalCartWeightGrams(
  lines: { category: string; quantity: number }[],
  weightsByCategory: CategoryWeightMap,
  fallbackGrams = defaultWeightGramsFromEnv()
): number {
  let total = 0;
  for (const line of lines) {
    const cat = normalizeCategoryLabel(line.category);
    const perPiece = weightsByCategory[cat] ?? fallbackGrams;
    total += Math.max(0, perPiece) * Math.max(0, line.quantity);
  }
  return total;
}

export function cartLinesToWeightInput(lines: CartLine[]) {
  return lines.map((l) => ({
    category: normalizeCategoryLabel(l.product.category),
    quantity: l.quantity,
  }));
}

export function gramsToCorreiosKg(grams: number): number {
  const kg = grams / 1000;
  return Math.max(0.3, Math.round(kg * 100) / 100);
}
