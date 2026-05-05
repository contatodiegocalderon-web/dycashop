import type { CartLine } from "@/types";

const SIZE_ORDER: Record<string, number> = { M: 0, G: 1, GG: 2 };

export function buildOrderWhatsAppText(
  lines: CartLine[],
  opts?: {
    /** URL do recibo com fotos (substitui o ID técnico no WhatsApp). */
    receiptUrl?: string;
    customerCep?: string;
  }
): string {
  const bySize = [...lines].sort(
    (a, b) => SIZE_ORDER[a.product.size] - SIZE_ORDER[b.product.size]
  );

  const groups = new Map<string, CartLine[]>();
  for (const line of bySize) {
    const k = line.product.size;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(line);
  }

  const receiptUrl = opts?.receiptUrl?.trim();
  const header = receiptUrl
    ? `*Novo pedido*\n📎 Ver seleção com fotos:\n${receiptUrl}\n`
    : `*Novo pedido*\n`;

  const parts: string[] = [header];

  const cep = opts?.customerCep?.trim();
  if (cep) {
    parts.push(`*CEP (frete):* ${cep}`);
    parts.push("");
  }

  for (const size of ["M", "G", "GG"] as const) {
    const g = groups.get(size);
    if (!g?.length) continue;
    parts.push(`*Tamanho ${size}*`);
    for (const line of g) {
      const p = line.product;
      parts.push(`• ${line.quantity}x ${p.brand} — ${p.color}`);
    }
    parts.push("");
  }

  parts.push("_Catálogo — enviar para finalização._");
  return parts.join("\n").trim();
}

export function waMeUrl(phoneDigits: string, text: string): string {
  const n = phoneDigits.replace(/\D/g, "");
  const enc = encodeURIComponent(text);
  return `https://wa.me/${n}?text=${enc}`;
}
