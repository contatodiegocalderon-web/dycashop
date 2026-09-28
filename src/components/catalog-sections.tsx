"use client";

import type { Product } from "@/types";
import { jeansCatalogSize } from "@/lib/jeans-size";
import { compareProductSizes, orderedProductSizes } from "@/lib/product-sizes";
import { ProductCard } from "./product-card";
import { isKitProduct } from "@/lib/kits-category";

function productsInNavGroup(list: Product[]): Product[] {
  return list.slice().sort((a, b) => {
    const aNumber = /^\d+$/.test(a.size.trim());
    const bNumber = /^\d+$/.test(b.size.trim());
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return compareProductSizes(a.size, b.size);
  });
}

type Props = { products: Product[]; flat?: boolean };

export function CatalogSections({ products, flat }: Props) {
  const useFlat =
    flat ||
    (products.length > 0 && products.every((p) => isKitProduct(p)));

  if (useFlat) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {products.map((p, idx) => (
          <ProductCard key={p.id} product={p} imagePriority={idx < 8} />
        ))}
      </div>
    );
  }

  const bySize = new Map<string, Product[]>();
  for (const p of products) {
    const group = jeansCatalogSize(p.category, p.size);
    const list = bySize.get(group) ?? [];
    list.push(p);
    bySize.set(group, list);
  }
  const sizes = orderedProductSizes(Array.from(bySize.keys()));

  return (
    <div className="space-y-8">
      {sizes.map((size) => {
        const list = productsInNavGroup(bySize.get(size) ?? []);
        if (!list.length) return null;
        return (
          <section key={size} id={`size-${size}`} className="scroll-mt-20">
            <div className="mb-3 flex items-center gap-2 border-b border-white/[0.06] pb-2">
              <h2 className="text-lg font-semibold text-stone-100">
                {size}
              </h2>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-stone-400">
                {list.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {list.map((p, idx) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  imagePriority={idx < 8}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
