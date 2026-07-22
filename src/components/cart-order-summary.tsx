"use client";

import {
  formatMoneyBrl,
  WHOLESALE_CART_MIN_PIECES,
  type CartPricingSummary,
} from "@/lib/cart-pricing";
import type { CategoryQtyTotal } from "@/lib/order-category-totals";

type Props = {
  categoryTotals: CategoryQtyTotal[];
  pricing: CartPricingSummary;
  /** Barra de progresso só na revisão varejo (etapa 1). */
  showWholesaleProgress?: boolean;
};

export function CartOrderSummary({
  categoryTotals,
  pricing,
  showWholesaleProgress = true,
}: Props) {
  const {
    totalPieces,
    subtotal,
    isWholesaleCart,
    piecesRemainingForWholesale,
  } = pricing;

  const progressPct = Math.min(
    100,
    (totalPieces / WHOLESALE_CART_MIN_PIECES) * 100
  );
  const pieceLabel =
    totalPieces === 1 ? "1 peça no total" : `${totalPieces} peças no total`;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-4 ring-1 ring-white/[0.04]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
        RESUMO DO PEDIDO
      </h2>

      <ul className="mt-3 space-y-1 text-sm text-stone-200">
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

      {!isWholesaleCart && showWholesaleProgress && (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={totalPieces}
              aria-valuemin={0}
              aria-valuemax={WHOLESALE_CART_MIN_PIECES}
              aria-label={`Faltam ${piecesRemainingForWholesale} peça(s) para o desconto de atacado`}
            />
          </div>

          <p className="mt-3 text-sm leading-relaxed text-stone-400">
            Adicione mais{" "}
            <strong className="font-semibold text-stone-200">
              {piecesRemainingForWholesale}{" "}
              {piecesRemainingForWholesale === 1 ? "peça" : "peças"}
            </strong>{" "}
            para conseguir o desconto de atacado em todos os produtos da loja{" "}
            <strong className="font-semibold text-stone-200">DYCASHOP</strong>.
          </p>
        </>
      )}
    </section>
  );
}
