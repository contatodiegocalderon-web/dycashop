"use client";

import Image from "next/image";
import { useEffect } from "react";
import { publicDriveImageUrl } from "@/lib/drive-image-url";

type Props = {
  driveFileId: string;
  label: string;
  open: boolean;
  onClose: () => void;
};

export function ProductImagePreview({
  driveFileId,
  label,
  open,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
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

  if (!open) return null;

  const src = publicDriveImageUrl(driveFileId, 1280);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
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
        <Image
          src={src}
          alt={label}
          fill
          priority
          unoptimized
          className="rounded-lg object-contain drop-shadow-2xl"
          sizes="(max-width: 768px) 92vw, 720px"
        />
      </div>
    </div>
  );
}
