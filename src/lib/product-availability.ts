import type { Product } from "@/types";

/** Stock disponível para novos pedidos = stock na BD − reservado em pedidos pendentes. */
export function effectiveAvailableStock(
  productStock: number,
  pendingReservedQty: number
): number {
  return Math.max(0, productStock - pendingReservedQty);
}

export function isProductOrderable(p: Pick<Product, "status" | "stock">): boolean {
  return p.status === "ATIVO" && p.stock > 0;
}
