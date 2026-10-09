const APPAREL_SIZE_ORDER = ["P", "M", "G", "GG"] as const;

export function compareProductSizes(a: string, b: string): number {
  const ia = APPAREL_SIZE_ORDER.indexOf(a as (typeof APPAREL_SIZE_ORDER)[number]);
  const ib = APPAREL_SIZE_ORDER.indexOf(b as (typeof APPAREL_SIZE_ORDER)[number]);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb;
  }
  return a.localeCompare(b, "pt", { numeric: true, sensitivity: "base" });
}

export function orderedProductSizes(sizes: readonly string[]): string[] {
  const unique = new Set<string>();
  for (let i = 0; i < sizes.length; i++) {
    const trimmed = sizes[i]!.trim();
    if (trimmed) unique.add(trimmed);
  }
  return Array.from(unique).sort(compareProductSizes);
}
