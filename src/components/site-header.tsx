"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/providers/cart-provider";

export function SiteHeader() {
  const { lines } = useCart();
  const totalItems = lines.reduce((n, l) => n + l.quantity, 0);
  const [bump, setBump] = useState(false);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current === null) {
      prev.current = totalItems;
      return;
    }
    if (totalItems > prev.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 550);
      prev.current = totalItems;
      return () => window.clearTimeout(t);
    }
    prev.current = totalItems;
  }, [totalItems]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0f0f11]/85 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-[#0f0f11]/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="group flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.28em] text-stone-100 transition-colors hover:text-white"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.07] ring-1 ring-white/[0.08] transition group-hover:bg-white/[0.1]">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-stone-200"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 7h10v10M7 17L17 7"
              />
            </svg>
          </span>
          DYCASHOP
        </Link>

        <Link
          href="/carrinho"
          prefetch
          className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-stone-100 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
          aria-label={`Carrinho, ${totalItems} itens`}
        >
          <svg
            viewBox="0 0 24 24"
            width={22}
            height={22}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-stone-200"
            aria-hidden
          >
            <path d="M6 7h15l-1.5 9h-12z" />
            <path d="M6 7 5 3H2" />
            <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          {totalItems > 0 && (
            <span
              className={`absolute -right-1 -top-1 flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold tabular-nums text-white shadow-lg shadow-emerald-900/40 ring-2 ring-[#0f0f11] ${
                bump ? "animate-cart-pop" : ""
              }`}
            >
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
