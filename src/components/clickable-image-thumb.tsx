"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ProductImagePreview,
  prefetchProductPreview,
} from "@/components/product-image-preview";

type Props = {
  src: string;
  label: string;
  driveFileId?: string | null;
  /** Classes do botão/container (ex.: relative h-24 w-…). */
  className?: string;
  sizes?: string;
  imgClassName?: string;
};

/** Miniatura clicável que abre a foto em ecrã completo. */
export function ClickableImageThumb({
  src,
  label,
  driveFileId,
  className = "relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-zinc-950",
  sizes = "72px",
  imgClassName = "object-cover",
}: Props) {
  const [open, setOpen] = useState(false);
  const safeSrc = src.trim();
  if (!safeSrc) {
    return <div className={className} aria-hidden />;
  }

  const warm = () => {
    prefetchProductPreview(safeSrc, driveFileId);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
        className={`${className} cursor-zoom-in`}
        aria-label={`Ver imagem maior: ${label}`}
      >
        <Image
          src={safeSrc}
          alt=""
          fill
          unoptimized
          className={imgClassName}
          sizes={sizes}
        />
      </button>
      <ProductImagePreview
        thumbSrc={safeSrc}
        driveFileId={driveFileId}
        label={label}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
