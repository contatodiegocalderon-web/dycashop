export const KITS_CATEGORY_LABEL = "KITs PRONTOS";
export const KITS_CATEGORY_SLUG = "kits-prontos";

function catalogKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isKitsCategory(label: string | null | undefined): boolean {
  const key = catalogKey(label ?? "");
  if (!key) return false;
  const compact = key.replace(/ /g, "");
  if (compact === "kitsprontos" || compact === "kitpronto") return true;
  return /\bkits?\b/.test(key) && /\bprontos?\b/.test(key);
}

export function isKitsCategorySlug(slug: string | null | undefined): boolean {
  let s = slug?.trim() ?? "";
  if (!s) return false;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  const last = s.split("/").filter(Boolean).pop() ?? s;
  const compact = catalogKey(last).replace(/ /g, "");
  return compact === "kitsprontos" || compact === "kitpronto";
}

export function isKitsStorefront(opts: {
  label?: string | null;
  slug?: string | null;
  pathname?: string | null;
}): boolean {
  return (
    isKitsCategory(opts.label) ||
    isKitsCategorySlug(opts.slug) ||
    isKitsCategorySlug(opts.pathname)
  );
}

export function isKitProduct(p: {
  source?: string | null;
  category?: string | null;
  unit_price?: number | string | null;
}): boolean {
  if (p.source === "admin") return true;
  if (isKitsCategory(p.category)) return true;
  return parseKitUnitPrice(p.unit_price) != null;
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
