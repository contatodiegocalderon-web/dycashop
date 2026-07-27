"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { publicDriveImageUrl } from "@/lib/drive-image-url";

type Props = {
  /** URL já usada no card (cache do browser → abre na hora). */
  thumbSrc: string;
  /** Se existir e o thumb for proxy Drive, tenta carregar versão maior. */
  driveFileId?: string | null;
  label: string;
  open: boolean;
  onClose: () => void;
};

/** Versão maior só quando o thumb veio do proxy Drive (Storage já costuma ser full). */
function hiResCandidate(
  thumbSrc: string,
  driveFileId?: string | null
): string | null {
  const fid = driveFileId?.trim();
  if (!fid) return null;
  if (!thumbSrc.includes("/api/drive-image/")) return null;
  const hi = publicDriveImageUrl(fid, 960);
  return hi === thumbSrc ? null : hi;
}

export function prefetchProductPreview(
  thumbSrc: string,
  driveFileId?: string | null
): void {
  if (typeof window === "undefined") return;
  const urls = [thumbSrc, hiResCandidate(thumbSrc, driveFileId)].filter(
    (u): u is string => Boolean(u)
  );
  for (const url of urls) {
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
}

export function ProductImagePreview({
  thumbSrc,
  driveFileId,
  label,
  open,
  onClose,
}: Props) {
  const hiRes = hiResCandidate(thumbSrc, driveFileId);
  const [hiResReady, setHiResReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setHiResReady(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !hiRes) return;
    let cancelled = false;
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setHiResReady(true);
    };
    img.onerror = () => {
      if (!cancelled) setHiResReady(false);
    };
    img.src = hiRes;
    if (img.complete && img.naturalWidth > 0) {
      setHiResReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, [open, hiRes]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-3 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white ring-1 ring-white/20"
        aria-label="Fechar"
      >
        ×
      </button>
      <div
        className="relative h-[min(90vh,900px)] w-[min(92vw,720px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thumb já em cache no card → aparece na hora */}
        <Image
          src={thumbSrc}
          alt={label}
          fill
          priority
          unoptimized
          className="rounded-lg object-contain drop-shadow-2xl"
          sizes="(max-width: 768px) 92vw, 720px"
        />
        {hiResReady && hiRes ? (
          <Image
            src={hiRes}
            alt=""
            fill
            priority
            unoptimized
            className="rounded-lg object-contain drop-shadow-2xl"
            sizes="(max-width: 768px) 92vw, 720px"
          />
        ) : null}
      </div>
    </div>
  );
}
