"use client";

import Link from "next/link";
import { DROP_LANDING_PATH } from "@/lib/dropshipping";

export function DropshippingCta() {
  return (
    <section className="w-full">
      <Link
        href={DROP_LANDING_PATH}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.1] bg-zinc-800/90 px-4 py-4 text-center shadow-inner shadow-black/25 transition hover:border-white/[0.16] hover:bg-zinc-700 active:scale-[0.99]"
      >
        <span className="text-sm font-bold uppercase tracking-wide text-stone-100">
          Venda sem estoque
        </span>
      </Link>
    </section>
  );
}
