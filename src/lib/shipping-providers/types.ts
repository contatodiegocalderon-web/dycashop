export type ShippingProviderId = "superfrete" | "melhorenvio";

export type PacSedexServiceQuote = {
  code: string;
  label: "PAC" | "SEDEX";
  price: number;
  /** Preço antes de desconto da plataforma (quando disponível). */
  originalPrice?: number;
  deliveryDays: number;
  error?: string;
};

export type PacSedexQuoteResult = {
  pac: PacSedexServiceQuote | null;
  sedex: PacSedexServiceQuote | null;
  provider: ShippingProviderId;
};

export type PacSedexQuoteInput = {
  originCep: string;
  destinationCep: string;
  weightKg: number;
  totalPieces: number;
};
