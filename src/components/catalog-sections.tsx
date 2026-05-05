"use client";

import type { Product, ProductSize } from "@/types";
import { ProductCard } from "./product-card";

const ORDER: ProductSize[] = ["M", "G", "GG"];

type Props = { products: Product[] };

export function CatalogSections({ products }: Props) {
  const bySize = new Map<ProductSize, Product[]>();
  for (const s of ORDER) bySize.set(s, []);
  for (const p of products) {
    bySize.get(p.size)?.push(p);
  }

  return (
    <div className="space-y-8">
      {ORDER.map((size) => {
        const list = bySize.get(size) ?? [];
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
