import { resolveShippingProvider } from "./config";
import { fetchMelhorEnvioPacSedexQuote } from "./melhorenvio";
import { fetchSuperfretePacSedexQuote } from "./superfrete";
import type { PacSedexQuoteInput, PacSedexQuoteResult } from "./types";

export type { PacSedexQuoteInput, PacSedexQuoteResult, ShippingProviderId } from "./types";

export async function fetchPacSedexQuote(
  opts: PacSedexQuoteInput
): Promise<PacSedexQuoteResult> {
  const provider = resolveShippingProvider();
  if (provider === "superfrete") {
    return fetchSuperfretePacSedexQuote(opts);
  }
  return fetchMelhorEnvioPacSedexQuote(opts);
}
