import type { WholesaleTier } from "@/lib/category-showcase";

function lookupKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export const PLAIN_SHIRT_CATEGORY = "CAMISETAS LISAS";

const GROUP_SEPARATOR = " · ";

export type PlainShirtLine = {
  id: "suedine" | "30.1";
  label: string;
  brand: string;
  videoUrl: string;
  wholesaleTiers: WholesaleTier[];
  /** Preço unitário no varejo (menos de 5 peças no carrinho). */
  retailPricePerPiece: number;
  weightGrams: number;
  costPerPiece: number;
};

/** Faixas fechadas até a próxima quantidade informada; a última fica em aberto. */
export const PLAIN_SHIRT_LINES: PlainShirtLine[] = [
  {
    id: "suedine",
    label: "SUEDINE",
    brand: "SUEDINE",
    videoUrl: "https://www.youtube.com/shorts/w4DaUxyHjhQ",
    retailPricePerPiece: 45,
    weightGrams: 600,
    costPerPiece: 23.5,
    wholesaleTiers: [
      { minQty: 10, maxQty: 19, price: 35 },
      { minQty: 20, maxQty: 29, price: 30 },
      { minQty: 30, maxQty: null, price: 28 },
    ],
  },
  {
    id: "30.1",
    label: "30.1",
    brand: "30.1",
    videoUrl: "https://www.youtube.com/shorts/VOrK98bJyzI",
    retailPricePerPiece: 30,
    weightGrams: 300,
    costPerPiece: 13.5,
    wholesaleTiers: [
      { minQty: 10, maxQty: 19, price: 25 },
      { minQty: 20, maxQty: 29, price: 22 },
      { minQty: 30, maxQty: 49, price: 20 },
      { minQty: 50, maxQty: 99, price: 19 },
      { minQty: 100, maxQty: null, price: 18 },
    ],
  },
];

export function isPlainShirtCategory(label: string | null | undefined): boolean {
  return lookupKey(label ?? "") === lookupKey(PLAIN_SHIRT_CATEGORY);
}

export function plainShirtLineForBrand(
  brand: string | null | undefined
): PlainShirtLine | null {
  const key = lookupKey(brand ?? "");
  if (!key) return null;
  return PLAIN_SHIRT_LINES.find((line) => lookupKey(line.brand) === key) ?? null;
}

/**
 * Camisetas lisas entram no pedido, no WhatsApp e na confirmação
 * separadas por tecido. As outras categorias continuam pelo nome da pasta.
 */
export function pricingGroupLabel(
  category: string | null | undefined,
  brand: string | null | undefined
): string {
  const cat = category?.trim() || "Sem categoria";
  if (!isPlainShirtCategory(cat)) return cat;
  const line = plainShirtLineForBrand(brand);
  if (!line) return cat;
  return `${cat}${GROUP_SEPARATOR}${line.label}`;
}

/** Pasta do catálogo quando o rótulo do pedido inclui o tecido. */
export function catalogCategoryFromPricingGroup(label: string): string {
  const idx = label.indexOf(GROUP_SEPARATOR);
  if (idx === -1) return label;
  const parent = label.slice(0, idx).trim();
  return isPlainShirtCategory(parent) ? parent : label;
}

export function plainShirtLineForProduct(
  category: string | null | undefined,
  brand: string | null | undefined
): PlainShirtLine | null {
  if (!isPlainShirtCategory(category)) return null;
  return plainShirtLineForBrand(brand);
}

export function plainShirtLineFromGroup(groupLabel: string): PlainShirtLine | null {
  if (catalogCategoryFromPricingGroup(groupLabel) === groupLabel) return null;
  const lineLabel = groupLabel.split(GROUP_SEPARATOR).pop()?.trim() ?? "";
  return plainShirtLineForBrand(lineLabel);
}

export function plainShirtUnitPriceForGroup(
  groupLabel: string,
  qty: number
): number | null {
  const line = plainShirtLineFromGroup(groupLabel);
  if (!line || qty < 1) return null;
  for (const tier of line.wholesaleTiers) {
    if (qty >= tier.minQty && (tier.maxQty == null || qty <= tier.maxQty)) {
      return tier.price;
    }
  }
  return null;
}
