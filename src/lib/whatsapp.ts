import type { CartLine } from "@/types";
import { totalsByCategoryFromCartLines } from "@/lib/order-category-totals";

export function buildOrderWhatsAppText(
  lines: CartLine[],
  opts?: {
    /** URL do recibo com fotos (substitui o ID técnico no WhatsApp). */
    receiptUrl?: string;
    customerCep?: string;
    customerName?: string;
    orderDisplayNumber?: number;
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
    parts.push("📎 Ver sua seleção com fotos:");
    parts.push(receiptUrl);
    parts.push("");
  }

  const name = opts?.customerName?.trim();
  if (name) {
    parts.push(`Nome: ${name}`);
    parts.push("");
  }

  const cep = opts?.customerCep?.trim();
  if (cep) {
    parts.push(`CEP (frete): ${cep}`);
    parts.push("");
  }

  for (const { label, qty } of totals) {
    parts.push(`x${qty} ${label}`);
  }
  if (totals.length) parts.push("");

  parts.push(
    "O vendedor vai calcular seu frete e finalizar seu pedido o quanto antes, aguarde só um momento!"
  );

  return parts.join("\n").trim();
}

export function waMeUrl(phoneDigits: string, text: string): string {
  const n = phoneDigits.replace(/\D/g, "");
  const enc = encodeURIComponent(text);
  return `https://wa.me/${n}?text=${enc}`;
}
