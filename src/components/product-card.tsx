"use client";

import type { Product } from "@/types";
import { useCart } from "@/providers/cart-provider";
import { useEffect, useState } from "react";

type Props = {
  product: Product;
  /** Primeiras imagens visíveis: carrega antes para melhor LCP. */
  imagePriority?: boolean;
};

export function ProductCard({ product, imagePriority }: Props) {
  const { addProduct, lines } = useCart();
  const line = lines.find((l) => l.productId === product.id);
  const inCart = line?.quantity ?? 0;
  const available = Math.max(0, product.stock - inCart);
  const canAdd = available > 0;

  const [qty, setQty] = useState(1);

  useEffect(() => {
    setQty(1);
  }, [product.id]);

  useEffect(() => {
    if (available <= 0) return;
    setQty((q) => Math.min(Math.max(1, q), available));
  }, [available, product.stock, inCart]);

  const imageSrc = product.drive_image_url;

  const catLabel =
    product.category?.trim() ||
    "Produto";

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
        <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
          {catLabel}
        </p>
        <h3 className="mt-1 line-clamp-2 text-lg font-bold uppercase leading-tight tracking-wide text-stone-50">
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
            <span className="text-emerald-500/85"> · {inCart} no carrinho</span>
          )}
        </p>

        <div className="mt-3 flex w-full items-stretch gap-2 border-t border-white/[0.07] pt-3">
          <div
            className={`grid min-w-0 flex-1 grid-cols-[minmax(2.75rem,auto)_1fr_minmax(2.75rem,auto)] items-center overflow-hidden rounded-xl border border-zinc-600/90 bg-zinc-950/90 text-[15px] font-semibold ${
              !canAdd ? "opacity-40" : ""
            }`}
          >
            <button
              type="button"
              aria-label="Diminuir quantidade"
              disabled={!canAdd || qty <= 1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setQty((q) => Math.max(1, q - 1));
              }}
              className="relative z-10 flex h-11 items-center justify-center text-stone-100 transition hover:bg-zinc-800 active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              -
            </button>
            <span className="pointer-events-none flex items-center justify-center tabular-nums text-stone-50">
              {canAdd ? qty : 0}
            </span>
            <button
              type="button"
              aria-label="Aumentar quantidade"
              disabled={!canAdd || qty >= available}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setQty((q) => Math.min(available, q + 1));
              }}
              className="relative z-10 flex h-11 items-center justify-center text-stone-100 transition hover:bg-zinc-800 active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              +
            </button>
          </div>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => canAdd && addProduct(product, qty)}
            className="min-w-[7.5rem] shrink-0 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-bold text-zinc-900 shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
      </div>
    </article>
  );
}
