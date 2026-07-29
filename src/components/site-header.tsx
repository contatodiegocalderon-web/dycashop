"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/providers/cart-provider";
import {
  markCatalogBrowseRestore,
  updateCatalogBrowseScroll,
} from "@/lib/catalog-browse-session";

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
          className="group flex items-center gap-2.5 sm:gap-3"
          aria-label="DYCASHOP — início"
        >
          <Image
            src="/brand-logo.png"
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 object-contain transition duration-300 group-hover:brightness-110 sm:h-10 sm:w-10"
            sizes="(max-width: 640px) 36px, 40px"
            priority
            unoptimized
          />
          <span className="text-[13px] font-semibold uppercase tracking-[0.28em] text-stone-100 transition-colors group-hover:text-white">
            DYCASHOP
          </span>
        </Link>

        <Link
          href="/carrinho"
          prefetch
          onClick={() => {
            updateCatalogBrowseScroll(window.scrollY);
            markCatalogBrowseRestore();
          }}
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
