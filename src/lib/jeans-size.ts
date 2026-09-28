import { sourceDriveFileId } from "@/lib/size-stock-name";
import type { Product } from "@/types";

/** Calça jogador: numeração da cintura entra no tamanho de letra do Jeans. */
const JEANS_TO_LETTER: Record<string, string> = {
  "38": "M",
  "40": "M",
  "42": "G",
  "44": "G",
  "46": "GG",
};

export function isJeansCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLocaleUpperCase("pt-BR") === "JEANS";
}

/** Tamanho mostrado no catálogo. Fora do Jeans, o valor original. */
export function jeansCatalogSize(
  category: string | null | undefined,
  size: string
): string {
  const trimmed = size.trim();
  if (!isJeansCategory(category)) return trimmed;
  return JEANS_TO_LETTER[trimmed] ?? trimmed;
}

export type CatalogDisplayProduct = Product & {
  /** 38 e 40 (ou 42 e 44) do mesmo modelo, vendidos como um tamanho só. */
  catalogStockMembers?: Product[];
};

/**
 * Junta as numerações da mesma foto num único card (38+40 = M).
 * O estoque de cada número fica nos produtos originais.
 */
export function presentCatalogProducts(products: Product[]): CatalogDisplayProduct[] {
  const plain: CatalogDisplayProduct[] = [];
  const groups = new Map<string, Product[]>();

  for (const product of products) {
    const letter = jeansCatalogSize(product.category, product.size);
    if (letter === product.size.trim()) {
      plain.push(product);
      continue;
    }
    const key = `${sourceDriveFileId(product.drive_file_id)}|${letter}`;
    const list = groups.get(key) ?? [];
    list.push(product);
    groups.set(key, list);
  }

  const merged: CatalogDisplayProduct[] = [];
  const keys = Array.from(groups.keys());
  for (let i = 0; i < keys.length; i++) {
    const list = groups.get(keys[i]!) ?? [];
    const first = list[0];
    if (!first) continue;
    const letter = jeansCatalogSize(first.category, first.size);
    const stock = list.reduce((sum, p) => sum + Math.max(0, p.stock), 0);
    let primary = first;
    for (let j = 1; j < list.length; j++) {
      const candidate = list[j]!;
      if (candidate.stock > primary.stock) primary = candidate;
    }
    merged.push({
      ...primary,
      size: letter,
      stock,
      status: stock <= 0 ? "ESGOTADO" : primary.status,
      catalogStockMembers: list,
    });
  }

  return plain.concat(merged);
}
