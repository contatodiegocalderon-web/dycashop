import type { ProductSize } from "@/types";

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

export type ProductStockRow = {
  category: string | null;
  size: string;
  stock: number;
  status: string;
  updated_at?: string | null;
};

export type StockBySizeRow = {
  size: string;
  /** Número de produtos (SKUs / ficheiros) neste tamanho. */
  productCount: number;
  /** Soma do campo `stock` de cada produto (peças disponíveis). */
  pieces: number;
};

export type CategoryStockSummary = {
  category: string;
  productCount: number;
  pieces: number;
  bySize: StockBySizeRow[];
};

export type StockInventorySnapshot = {
  categories: CategoryStockSummary[];
  grandTotal: {
    productCount: number;
    pieces: number;
  };
  /** Maior `updated_at` entre produtos (aproxima última alteração no catálogo). */
  catalogLastUpdatedAt: string | null;
};

function categoryLabel(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  return t || "Sem categoria";
}

function normalizeSize(raw: string): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "M" || s === "G" || s === "GG") return s;
  return s || "—";
}

/**
 * Total de peças por categoria = Σ stock de cada produto na categoria.
 * Por tamanho: conta produtos e soma stock (ex.: 400 linhas M com stock 1 → 400 peças se cada uma tiver stock 1;
 * na prática cada linha é um SKU com o seu `stock`).
 */
export function aggregateStockInventory(
  products: ProductStockRow[]
): StockInventorySnapshot {
  type SizeAgg = { productCount: number; pieces: number };
  type CatAgg = {
    productCount: number;
    pieces: number;
    bySize: Map<string, SizeAgg>;
  };

  const byCategory = new Map<string, CatAgg>();
  let catalogLastUpdatedAt: string | null = null;

  for (const p of products) {
    const cat = categoryLabel(p.category);
    const size = normalizeSize(p.size);
    const stock = Math.max(0, Number(p.stock) || 0);

    if (p.updated_at) {
      if (!catalogLastUpdatedAt || p.updated_at > catalogLastUpdatedAt) {
        catalogLastUpdatedAt = p.updated_at;
      }
    }

    const cur =
      byCategory.get(cat) ??
      ({
        productCount: 0,
        pieces: 0,
        bySize: new Map<string, SizeAgg>(),
      } satisfies CatAgg);

    cur.productCount += 1;
    cur.pieces += stock;

    const sz =
      cur.bySize.get(size) ?? ({ productCount: 0, pieces: 0 } satisfies SizeAgg);
    sz.productCount += 1;
    sz.pieces += stock;
    cur.bySize.set(size, sz);

    byCategory.set(cat, cur);
  }

  const categories: CategoryStockSummary[] = Array.from(byCategory.entries())
    .map(([category, agg]) => {
      const sizeKeys = Array.from(agg.bySize.keys()).sort((a, b) => {
        const ia = SIZE_ORDER.indexOf(a as ProductSize);
        const ib = SIZE_ORDER.indexOf(b as ProductSize);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b, "pt-BR");
      });
      const bySize: StockBySizeRow[] = sizeKeys.map((size) => {
        const s = agg.bySize.get(size)!;
        return {
          size,
          productCount: s.productCount,
          pieces: s.pieces,
        };
      });
      return {
        category,
        productCount: agg.productCount,
        pieces: agg.pieces,
        bySize,
      };
    })
    .sort((a, b) => b.pieces - a.pieces || a.category.localeCompare(b.category, "pt-BR"));

  const grandTotal = categories.reduce(
    (acc, c) => ({
      productCount: acc.productCount + c.productCount,
      pieces: acc.pieces + c.pieces,
    }),
    { productCount: 0, pieces: 0 }
  );

  return { categories, grandTotal, catalogLastUpdatedAt };
}
