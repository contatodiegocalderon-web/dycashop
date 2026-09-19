import type { CartLine, OrderItemRow } from "@/types";

export type CategoryQtyTotal = { label: string; qty: number };

function normalizeCategory(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  return s !== "" ? s : "Sem categoria";
}

type OrderItemQty = Pick<OrderItemRow, "quantity"> & {
  snapshot_category?: string | null;
};

/** Totais por pasta/categoria para recibo e WhatsApp (pedido já gravado). */
export function totalsByCategoryFromOrderItems(
  items: OrderItemQty[]
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

function joinPortugueseList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Junta categorias em português: "10 bermudas", "10 bermudas e 5 camisetas". */
export function formatCategoryTotalsPhrase(cats: CategoryQtyTotal[]): string {
  const named = cats.filter(
    (c) => c.qty > 0 && c.label.trim() !== "" && c.label !== "Sem categoria"
  );
  const unnamedQty = cats
    .filter(
      (c) => c.qty > 0 && (c.label.trim() === "" || c.label === "Sem categoria")
    )
    .reduce((sum, c) => sum + c.qty, 0);

  const parts = named.map((c) => `${c.qty} ${c.label.trim().toLowerCase()}`);
  if (unnamedQty > 0) {
    parts.push(`${unnamedQty} ${unnamedQty === 1 ? "peça" : "peças"}`);
  }
  return joinPortugueseList(parts);
}

export function formatOrderItemsPhrase(
  items: OrderItemQty[] | null | undefined
): string {
  if (!items?.length) return "";
  return formatCategoryTotalsPhrase(totalsByCategoryFromOrderItems(items));
}
