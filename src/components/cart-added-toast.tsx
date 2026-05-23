"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { CartAddToastState } from "@/providers/cart-provider";

type Props = {
  toast: CartAddToastState | null;
  onDismiss: () => void;
};

export function CartAddedToast({ toast, onDismiss }: Props) {
  const pathname = usePathname();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, 1650);
    return () => window.clearTimeout(t);
  }, [toast?.key, toast?.totalItems, onDismiss]);

  if (!toast || pathname?.startsWith("/admin")) return null;

  const label =
    toast.totalItems === 1 ? "1 peça no carrinho" : `${toast.totalItems} peças no carrinho`;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="sr-only">{label}</p>
      <div
        key={`${toast.key}-${toast.totalItems}`}
        className="animate-cart-total-pulse relative flex flex-col items-center justify-center"
      >
        <span
          key={`ring-${toast.key}`}
          className="absolute inset-0 -m-6 animate-cart-total-ring rounded-full bg-emerald-400/25"
          aria-hidden
        />
        <span
          className="absolute inset-0 -m-3 rounded-full bg-emerald-500/30 blur-xl"
          aria-hidden
        />
        <div className="relative flex min-h-[7.5rem] min-w-[7.5rem] flex-col items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-500/25 px-12 py-10 shadow-[0_0_48px_12px_rgba(52,211,153,0.35)] ring-2 ring-emerald-400/40 backdrop-blur-sm sm:min-h-[8.5rem] sm:min-w-[8.5rem]">
          <span className="text-6xl font-extrabold tabular-nums tracking-tight text-emerald-50 drop-shadow-[0_2px_12px_rgba(16,185,129,0.65)] sm:text-7xl">
            {toast.totalItems}
          </span>
          <span className="mt-1.5 text-xs font-bold uppercase tracking-[0.22em] text-emerald-100/90">
            no carrinho
          </span>
        </div>
      </div>
    </div>
  );
}
