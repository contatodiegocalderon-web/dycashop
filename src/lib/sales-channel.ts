/** Regras de canal de venda no catálogo. */

/** Máximo de peças no checkout de varejo (Mercado Pago). */
export const RETAIL_MAX_PIECES = 4;

/** A partir desta quantidade o fluxo é atacado (WhatsApp). */
export const WHOLESALE_MIN_PIECES = RETAIL_MAX_PIECES + 1;

export type SalesVolumeChannel = "varejo" | "atacado";

export function salesChannelFromPieces(pieces: number): SalesVolumeChannel {
  const n = Math.max(0, Number(pieces) || 0);
  return n >= WHOLESALE_MIN_PIECES ? "atacado" : "varejo";
}

export function isRetailPieceCount(pieces: number): boolean {
  const n = Math.max(0, Number(pieces) || 0);
  return n >= 1 && n <= RETAIL_MAX_PIECES;
}

export function salesChannelLabel(channel: SalesVolumeChannel): string {
  return channel === "atacado"
    ? `Atacado (${WHOLESALE_MIN_PIECES}+ peças)`
    : `Varejo (1–${RETAIL_MAX_PIECES} peças)`;
}
