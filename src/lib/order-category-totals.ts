import type { CartLine, OrderItemRow } from "@/types";

export type CategoryQtyTotal = { label: string; qty: number };

function normalizeCategory(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  return s !== "" ? s : "Sem categoria";
}

/** Totais por pasta/categoria para recibo e WhatsApp (pedido já gravado). */
export function totalsByCategoryFromOrderItems(
  items: OrderItemRow[]
): CategoryQtyTotal[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const cat = normalizeCategory(it.snapshot_category);
    m.set(cat, (m.get(cat) ?? 0) + it.quantity);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, qty]) => ({ label, qty }));
}

/** Totais por categoria a partir do carrinho (antes de criar o pedido). */
export function totalsByCategoryFromCartLines(lines: CartLine[]): CategoryQtyTotal[] {
  const m = new Map<string, number>();
  for (const line of lines) {
    const cat = normalizeCategory(line.product.category);
    m.set(cat, (m.get(cat) ?? 0) + line.quantity);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, qty]) => ({ label, qty }));
}
