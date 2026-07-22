import { CRM_ATACADO_MIN_PIECES } from "@/lib/crm-funnel";
import type { WholesaleTier } from "@/lib/category-showcase";
import type { CartLine } from "@/types";

export const WHOLESALE_CART_MIN_PIECES = CRM_ATACADO_MIN_PIECES;

export function formatMoneyBrl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function resolveUnitPrice(
  tiers: WholesaleTier[],
  qty: number
): number | null {
  if (qty < 1 || !tiers.length) return null;
  for (const tier of tiers) {
    if (qty >= tier.minQty && (tier.maxQty == null || qty <= tier.maxQty)) {
      return tier.price;
    }
  }
  return null;
}

export function getVarejoUnitPrice(
  tiers: WholesaleTier[],
  retailPricePerPiece?: number | string | null
): number | null {
  const retail =
    retailPricePerPiece == null || retailPricePerPiece === ""
      ? null
      : Number(
          typeof retailPricePerPiece === "string"
            ? retailPricePerPiece.replace(",", ".")
            : retailPricePerPiece
        );
  if (retail != null && Number.isFinite(retail) && retail > 0) {
    return retail;
  }
  for (const qty of [1, 2, 3, 4]) {
    const fromTier = resolveUnitPrice(tiers, qty);
    if (fromTier != null) return fromTier;
  }
  return null;
}

export function getAtacadoUnitPrice(
  tiers: WholesaleTier[],
  categoryQtyInCart: number
): number | null {
  return resolveUnitPrice(tiers, categoryQtyInCart);
}

export type CartLinePricing = {
  productId: string;
  unitPrice: number | null;
  lineTotal: number | null;
  isWholesalePrice: boolean;
};

export type CartPricingSummary = {
  lines: CartLinePricing[];
  subtotal: number | null;
  totalPieces: number;
  isWholesaleCart: boolean;
  piecesRemainingForWholesale: number;
};

function normalizeCategory(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  return s !== "" ? s : "Sem categoria";
}

export function computeCartPricing(
  lines: CartLine[],
  tiersByCategory: Record<string, WholesaleTier[]>,
  retailByCategory: Record<string, number | null> = {}
): CartPricingSummary {
  const totalPieces = lines.reduce(
    (sum, l) => sum + Math.max(0, l.quantity),
    0
  );
  const isWholesaleCart = totalPieces >= WHOLESALE_CART_MIN_PIECES;
  const piecesRemainingForWholesale = Math.max(
    0,
    WHOLESALE_CART_MIN_PIECES - totalPieces
  );

  let subtotal = 0;
  let hasAnyPrice = false;
  let allPriced = lines.length > 0;

  const linePricings: CartLinePricing[] = lines.map((line) => {
    if (isWholesaleCart) {
      return {
        productId: line.productId,
        unitPrice: null,
        lineTotal: null,
        isWholesalePrice: true,
      };
    }

    const cat = normalizeCategory(line.product.category);
    const tiers = tiersByCategory[cat];
    if (!tiers?.length) {
      allPriced = false;
      return {
        productId: line.productId,
        unitPrice: null,
        lineTotal: null,
        isWholesalePrice: isWholesaleCart,
      };
    }

    const unitPrice = getVarejoUnitPrice(tiers, retailByCategory[cat] ?? null);

    if (unitPrice == null) {
      allPriced = false;
      return {
        productId: line.productId,
        unitPrice: null,
        lineTotal: null,
        isWholesalePrice: isWholesaleCart,
      };
    }

    const lineTotal = unitPrice * line.quantity;
    hasAnyPrice = true;
    subtotal += lineTotal;

    return {
      productId: line.productId,
      unitPrice,
      lineTotal,
      isWholesalePrice: isWholesaleCart,
    };
  });

  return {
    lines: linePricings,
    subtotal: hasAnyPrice && allPriced ? subtotal : hasAnyPrice ? subtotal : null,
    totalPieces,
    isWholesaleCart,
    piecesRemainingForWholesale,
  };
}
