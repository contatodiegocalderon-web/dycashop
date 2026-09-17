"use client";

import {
  formatMoneyBrl,
  type CartPricingSummary,
} from "@/lib/cart-pricing";
import type { CategoryQtyTotal } from "@/lib/order-category-totals";

type Props = {
  categoryTotals: CategoryQtyTotal[];
  pricing: CartPricingSummary;
};

export function CartOrderSummary({
  categoryTotals,
  pricing,
}: Props) {
  const { totalPieces, subtotal, isWholesaleCart } = pricing;

  const pieceLabel =
    totalPieces === 1 ? "1 peça no total" : `${totalPieces} peças no total`;

  return (
    <section className="rounded-2xl border border-emerald-400/35 bg-zinc-900/90 p-5 shadow-[0_0_0_1px_rgba(52,211,153,0.12),0_12px_40px_-16px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400/20">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
        RESUMO DO PEDIDO
      </h2>

      <ul className="mt-3 space-y-1 text-sm font-semibold text-stone-50">
        {categoryTotals.map((row) => (
          <li key={row.label}>
            {row.qty}x {row.label}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-sm text-stone-500">{pieceLabel}</p>

      {subtotal != null && !isWholesaleCart && (
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-white/[0.06] pt-4">
          <span className="text-sm text-stone-400">Subtotal</span>
          <span className="text-lg font-semibold tabular-nums text-stone-100">
            {formatMoneyBrl(subtotal)}
          </span>
        </div>
      )}
    </section>
  );
}
