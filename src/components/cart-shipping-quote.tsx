"use client";

import { useEffect, useMemo, useState } from "react";
import type { CartLine } from "@/types";
import { cartLinesToWeightInput, normalizeCepDigits } from "@/lib/cart-shipping-weight";
import {
  isShippingOption,
  type ShippingQuotePayload,
} from "@/lib/shipping-quote-types";

type Props = {
  lines: CartLine[];
  cep: string;
  onQuoteChange?: (quote: ShippingQuotePayload | null) => void;
};

export function CartShippingQuote({ lines, cep, onQuoteChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ShippingQuotePayload | null>(null);

  const cepDigits = useMemo(() => normalizeCepDigits(cep), [cep]);
  const itemsKey = useMemo(
    () =>
      JSON.stringify(
        cartLinesToWeightInput(lines).sort((a, b) =>
          a.category.localeCompare(b.category, "pt-BR")
        )
      ),
    [lines]
  );

  useEffect(() => {
    onQuoteChange?.(quote);
  }, [quote, onQuoteChange]);

  useEffect(() => {
    if (!cepDigits || lines.length === 0) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const res = await fetch("/api/shipping/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cep: cepDigits,
              items: cartLinesToWeightInput(lines),
            }),
            signal: ac.signal,
          });
          const data = (await res.json()) as ShippingQuotePayload & {
            error?: string;
          };
          if (!res.ok) throw new Error(data.error ?? "Falha ao calcular frete");
          setQuote(data);
        } catch (e) {
          if (ac.signal.aborted) return;
          setQuote(null);
          setError(e instanceof Error ? e.message : "Erro ao calcular frete");
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, 500);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [cepDigits, itemsKey, lines]);

  if (!cepDigits) {
    return (
      <p className="mt-2 text-xs text-stone-500">
        Informe o CEP completo para ver PAC e SEDEX estimados.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="mt-3 text-sm text-stone-400" aria-live="polite">
        Calculando frete…
      </p>
    );
  }

  if (error) {
    return (
      <p className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
        {error}
      </p>
    );
  }

  if (!quote) return null;

  const pac = isShippingOption(quote.pac) ? quote.pac : null;
  const sedex = isShippingOption(quote.sedex) ? quote.sedex : null;

  if (!pac && !sedex) {
    return (
      <p className="mt-3 text-xs text-stone-500">
        Frete indisponível para este CEP no momento.
      </p>
    );
  }

  return (
    <div
      className="mt-3 space-y-2 rounded-xl border border-white/10 bg-zinc-900/50 p-3"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
        Frete estimado (Correios)
      </p>
      <p className="text-[11px] text-stone-500">
        {quote.totalPieces} peça(s) · {(quote.totalWeightGrams / 1000).toFixed(2)}{" "}
        kg
      </p>
      <ul className="space-y-2">
        {pac && (
          <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-black/25 px-3 py-2">
            <span className="font-semibold text-stone-100">PAC</span>
            <span className="text-sm text-emerald-300">
              {pac.priceFormatted} · {pac.deliveryLabel}
            </span>
          </li>
        )}
        {sedex && (
          <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-black/25 px-3 py-2">
            <span className="font-semibold text-stone-100">SEDEX</span>
            <span className="text-sm text-emerald-300">
              {sedex.priceFormatted} · {sedex.deliveryLabel}
            </span>
          </li>
        )}
      </ul>
      <p className="text-[10px] text-stone-600">
        Valores aproximados (balcão Correios). O vendedor confirma no WhatsApp.
      </p>
    </div>
  );
}
