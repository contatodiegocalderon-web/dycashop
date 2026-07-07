import type { CartLine } from "@/types";
import { totalsByCategoryFromCartLines } from "@/lib/order-category-totals";
import {
  isShippingOption,
  type ShippingQuoteOption,
  type ShippingQuotePayload,
} from "@/lib/shipping-quote-types";

const FOOTER_MESSAGE =
  "O vendedor vai te passar o orçamento completo e finalizar seu pedido o quanto antes, aguarde só um momento!";

export function buildOrderWhatsAppText(
  lines: CartLine[],
  opts?: {
    /** URL do recibo com fotos (substitui o ID técnico no WhatsApp). */
    receiptUrl?: string;
    customerCep?: string;
    customerName?: string;
    orderDisplayNumber?: number;
    shippingQuote?: ShippingQuotePayload | null;
    selectedShipping?: ShippingQuoteOption | null;
  }
): string {
  const totals = totalsByCategoryFromCartLines(lines);

  const receiptUrl = opts?.receiptUrl?.trim();
  const hasOrderNumber =
    opts?.orderDisplayNumber != null && Number.isFinite(opts.orderDisplayNumber);
  const header = hasOrderNumber
    ? `*Novo pedido - Pedido #${opts!.orderDisplayNumber}*`
    : "*Novo pedido*";

  const parts: string[] = [header, ""];

  if (receiptUrl) {
    parts.push(`  📎 Ver sua seleção com fotos: ${receiptUrl}`);
    parts.push("");
  }

  const name = opts?.customerName?.trim();
  if (name) {
    parts.push(`  Nome: ${name}`);
    parts.push("");
  }

  for (const { label, qty } of totals) {
    parts.push(`🛒*x${qty} ${label}*`);
  }
  if (totals.length) parts.push("");

  const cepRaw = opts?.customerCep?.trim();
  const cepDigits = cepRaw?.replace(/\D/g, "") ?? "";
  if (cepDigits) {
    parts.push(`CEP: ${cepDigits}`);
  }

  const quote = opts?.shippingQuote;
  const selected = opts?.selectedShipping ?? null;
  const pac = quote && isShippingOption(quote.pac) ? quote.pac : null;
  const sedex = quote && isShippingOption(quote.sedex) ? quote.sedex : null;

  const shippingLines: string[] = [];
  if (selected) {
    shippingLines.push(
      `*${selected.label} ${selected.priceFormatted}, ${selected.deliveryLabel}*`
    );
  } else {
    if (sedex) {
      shippingLines.push(
        `*SEDEX ${sedex.priceFormatted}, ${sedex.deliveryLabel}*`
      );
    }
    if (pac) {
      shippingLines.push(`*PAC ${pac.priceFormatted}, ${pac.deliveryLabel}*`);
    }
  }

  if (shippingLines.length) {
    parts.push("FRETE👇");
    parts.push(...shippingLines);
    parts.push("");
  }

  parts.push(FOOTER_MESSAGE);

  return parts.join("\n").trim();
}

export function waMeUrl(phoneDigits: string, text: string): string {
  const n = phoneDigits.replace(/\D/g, "");
  const enc = encodeURIComponent(text);
  return `https://wa.me/${n}?text=${enc}`;
}
