export const KITS_CATEGORY_LABEL = "KITs PRONTOS";
export const KITS_CATEGORY_SLUG = "kits-prontos";

export function isKitsCategory(label: string | null | undefined): boolean {
  const s = label?.trim() ?? "";
  if (!s) return false;
  const key = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return key === "kits prontos" || key === "kits-prontos";
}

export function isKitsCategorySlug(slug: string | null | undefined): boolean {
  const s = slug?.trim().toLowerCase() ?? "";
  return s === KITS_CATEGORY_SLUG;
}

export function isKitProduct(p: {
  source?: string | null;
  category?: string | null;
}): boolean {
  return p.source === "admin" || isKitsCategory(p.category);
}

export function ensureKitsCategoryLabel(labels: Iterable<string>): string[] {
  const out = Array.from(labels);
  if (!out.some((l) => isKitsCategory(l))) {
    out.push(KITS_CATEGORY_LABEL);
  }
  return out;
}

export function parseKitUnitPrice(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function parseKitWeightGrams(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}
