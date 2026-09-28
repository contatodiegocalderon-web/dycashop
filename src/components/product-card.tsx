"use client";

import Image from "next/image";
import { useState } from "react";
import type { CatalogDisplayProduct } from "@/lib/jeans-size";
import { ProductImagePreview, prefetchProductPreview } from "@/components/product-image-preview";
import { useCart } from "@/providers/cart-provider";
import { formatMoneyBrl } from "@/lib/cart-pricing";
import { isKitProduct, parseKitUnitPrice } from "@/lib/kits-category";

type Props = {
  product: CatalogDisplayProduct;
  /** Primeiras imagens visíveis: carrega antes para melhor LCP. */
  imagePriority?: boolean;
};

export function ProductCard({ product, imagePriority }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { addProduct, lines, removeLine } = useCart();
  const members = product.catalogStockMembers;
  const inCart = members
    ? members.reduce((sum, member) => {
        const qty = lines.find((l) => l.productId === member.id)?.quantity ?? 0;
        return sum + qty;
      }, 0)
    : (lines.find((l) => l.productId === product.id)?.quantity ?? 0);
  const stockTotal = members
    ? members.reduce((sum, member) => sum + Math.max(0, member.stock), 0)
    : product.stock;
  const available = Math.max(0, stockTotal - inCart);
  const canAdd = available > 0;
  const removeFromCart = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!members) {
      removeLine(product.id);
      return;
    }
    for (let i = 0; i < members.length; i++) {
      removeLine(members[i]!.id);
    }
  };
  const addOne = () => {
    if (!members) {
      addProduct(product, 1);
      return;
    }
    const target = members.find((member) => {
      const qty = lines.find((l) => l.productId === member.id)?.quantity ?? 0;
      return qty < member.stock;
    });
    if (target) addProduct(target, 1);
  };

  const imageSrc = product.drive_image_url;
  const kitPrice = parseKitUnitPrice(product.unit_price);
  const kit = isKitProduct(product) || kitPrice != null;
  const nameLabel = [product.brand, product.color].filter((part) => part?.trim()).join(" ");
  const previewLabel = kit ? nameLabel : `${nameLabel} · ${product.size}`;

  const warmPreview = () => {
    prefetchProductPreview(imageSrc, product.drive_file_id);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-lg shadow-black/20 ring-1 ring-white/[0.04]">
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        onPointerEnter={warmPreview}
        onFocus={warmPreview}
        onTouchStart={warmPreview}
        className="relative aspect-[3/4] max-h-[220px] w-full cursor-zoom-in bg-zinc-950 sm:max-h-[240px]"
        aria-label={`Ver imagem maior: ${previewLabel}`}
      >
        <Image
          src={imageSrc}
          alt=""
          role="presentation"
          fill
          priority={imagePriority}
          unoptimized
          className="object-cover transition duration-300 group-hover:brightness-110"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
        />
        {!kit && (
          <span className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 text-[11px] font-bold uppercase tabular-nums text-white">
            {product.size}
          </span>
        )}
      </button>
      <ProductImagePreview
        thumbSrc={imageSrc}
        driveFileId={product.drive_file_id}
        label={previewLabel}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-2 text-lg font-bold uppercase leading-tight tracking-wide text-stone-50">
          {product.brand}
        </h3>
        {product.color?.trim() ? (
          <p className="mt-0.5 line-clamp-1 text-sm font-medium uppercase tracking-wide text-stone-400">
            {product.color}
          </p>
        ) : null}

        <p className="mt-2 text-[13px] text-stone-500">
          {kit ? (
            <span className="font-semibold tabular-nums text-stone-100">
              {kitPrice != null ? formatMoneyBrl(kitPrice) : "—"}
            </span>
          ) : (
            <>
              Est.{" "}
              <span className="font-semibold tabular-nums text-stone-100">
                {stockTotal}
              </span>
            </>
          )}
          {inCart > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="text-emerald-500/85">
                · {inCart} no carrinho
              </span>
              <button
                type="button"
                aria-label="Remover do carrinho"
                title="Remover do carrinho"
                onClick={removeFromCart}
                onTouchEnd={removeFromCart}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xl font-bold leading-none text-red-500 transition hover:bg-red-500/15 hover:text-red-400 active:scale-95"
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
              if (canAdd) addOne();
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
