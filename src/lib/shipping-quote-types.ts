export type ShippingQuoteOption = {
  label: string;
  code: string;
  price: number;
  priceFormatted: string;
  deliveryDays: number;
  deliveryLabel: string;
};

export type ShippingQuotePayload = {
  destinationCep: string;
  totalPieces: number;
  totalWeightGrams: number;
  totalWeightKg: number;
  pac: ShippingQuoteOption | { error: string } | null;
  sedex: ShippingQuoteOption | { error: string } | null;
};

export function isShippingOption(
  v: ShippingQuoteOption | { error: string } | null | undefined
): v is ShippingQuoteOption {
  return Boolean(v && "price" in v && typeof v.price === "number");
}
