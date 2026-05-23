"use client";

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
      <img
        src={src}
        alt={label}
        className="max-h-[min(90vh,900px)] max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
