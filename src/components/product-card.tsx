"use client";

import type { Product } from "@/types";
import { useCart } from "@/providers/cart-provider";

type Props = {
  product: Product;
  /** Primeiras imagens visíveis: carrega antes para melhor LCP. */
  imagePriority?: boolean;
};

export function ProductCard({ product, imagePriority }: Props) {
  const { addProduct, lines, removeLine } = useCart();
  const line = lines.find((l) => l.productId === product.id);
  const inCart = line?.quantity ?? 0;
  const available = Math.max(0, product.stock - inCart);
  const canAdd = available > 0;

  const imageSrc = product.drive_image_url;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-lg shadow-black/20 ring-1 ring-white/[0.04]">
      <div className="relative aspect-[3/4] max-h-[220px] bg-zinc-950 sm:max-h-[240px]">
        <img
          src={imageSrc}
          alt=""
          role="presentation"
          className="absolute inset-0 h-full w-full object-cover"
          loading={imagePriority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={imagePriority ? "high" : "low"}
        />
        <span className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 text-[11px] font-bold uppercase tabular-nums text-white">
          {product.size}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-2 text-lg font-bold uppercase leading-tight tracking-wide text-stone-50">
          {product.brand}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-sm font-medium uppercase tracking-wide text-stone-400">
          {product.color}
        </p>

        <p className="mt-2 text-[13px] text-stone-500">
          Est.{" "}
          <span className="font-semibold tabular-nums text-stone-100">
            {product.stock}
          </span>
          {inCart > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="text-emerald-500/85">
                · {inCart} no carrinho
              </span>
              <button
                type="button"
                aria-label="Remover do carrinho"
                title="Remover do carrinho"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeLine(product.id);
                }}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-lg font-bold leading-none text-red-500 transition hover:bg-red-500/15 hover:text-red-400 active:scale-95"
              >
                ×
              </button>
            </span>
          )}
        </p>

        <div className="mt-3 flex justify-center border-t border-white/[0.07] pt-3">
          <button
            type="button"
            disabled={!canAdd}
            aria-label="Adicionar ao carrinho"
            title="Adicionar ao carrinho"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (canAdd) addProduct(product, 1);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-zinc-600 text-[2rem] font-bold leading-none text-white shadow-md shadow-black/35 transition hover:bg-zinc-500 hover:border-white/25 active:scale-[0.96] sm:h-12 sm:w-12 sm:text-3xl disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
