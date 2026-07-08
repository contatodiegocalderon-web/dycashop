"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CartLine } from "@/types";
import {
  cartLinesToWeightInput,
  normalizeCepDigits,
} from "@/lib/cart-shipping-weight";
import {
  isShippingOption,
  type ShippingQuoteOption,
  type ShippingQuotePayload,
} from "@/lib/shipping-quote-types";
import { formatCepCityState } from "@/lib/cep-lookup";

type Props = {
  lines: CartLine[];
  cep: string;
  onQuoteChange?: (quote: ShippingQuotePayload | null) => void;
  onSelectionChange?: (option: ShippingQuoteOption | null) => void;
};

function CorreiosLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/correios-logo.png"
      alt="Correios"
      width={72}
      height={28}
      className={`h-7 w-auto object-contain object-left ${className ?? ""}`}
    />
  );
}

function ShippingOptionCard({
  option,
  selected,
  onSelect,
}: {
  option: ShippingQuoteOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-emerald-500/60 bg-emerald-950/25 ring-1 ring-emerald-500/30"
          : "border-white/15 bg-zinc-950/40 hover:border-white/25"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected
            ? "border-emerald-500 bg-emerald-500"
            : "border-stone-500 bg-transparent"
        }`}
        aria-hidden
      >
        {selected ? (
          <span className="h-2 w-2 rounded-full bg-white" />
        ) : null}
      </span>
      <CorreiosLogo className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-stone-100">{option.label}</p>
        <p className="text-xs text-stone-500">{option.deliveryLabel}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-bold text-emerald-400">
          {option.priceFormatted}
        </p>
        {option.originalPriceFormatted &&
          option.originalPriceFormatted !== option.priceFormatted && (
            <p className="text-xs text-stone-500 line-through">
              {option.originalPriceFormatted}
            </p>
          )}
      </div>
    </button>
  );
}

export function CartShippingQuote({
  lines,
  cep,
  onQuoteChange,
  onSelectionChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ShippingQuotePayload | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const requestSeq = useRef(0);

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

  const weightItems = useMemo(
    () =>
      JSON.parse(itemsKey) as ReturnType<typeof cartLinesToWeightInput>,
    [itemsKey]
  );

  useEffect(() => {
    onQuoteChange?.(quote);
  }, [quote, onQuoteChange]);

  useEffect(() => {
    if (!cepDigits || weightItems.length === 0) {
      setQuote(null);
      setError(null);
      setLoading(false);
      setSelectedCode(null);
      onSelectionChange?.(null);
      return;
    }

    const seq = ++requestSeq.current;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        const timeout = window.setTimeout(() => ac.abort(), 25_000);
        try {
          const res = await fetch("/api/shipping/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cep: cepDigits,
              items: weightItems,
            }),
            signal: ac.signal,
          });
          const data = (await res.json()) as ShippingQuotePayload & {
            error?: string;
          };
          if (requestSeq.current !== seq) return;
          if (!res.ok) throw new Error(data.error ?? "Falha ao calcular frete");
          setQuote(data);
        } catch (e) {
          if (requestSeq.current !== seq) return;
          if (e instanceof DOMException && e.name === "AbortError") {
            setError(
              "O cálculo demorou demais. Verifique o CEP e tente de novo."
            );
            setQuote(null);
            setSelectedCode(null);
            return;
          }
          setQuote(null);
          setError(e instanceof Error ? e.message : "Erro ao calcular frete");
          setSelectedCode(null);
        } finally {
          window.clearTimeout(timeout);
          if (requestSeq.current === seq) setLoading(false);
        }
      })();
    }, 500);

    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [cepDigits, itemsKey, weightItems]);

  const pac = quote && isShippingOption(quote.pac) ? quote.pac : null;
  const sedex = quote && isShippingOption(quote.sedex) ? quote.sedex : null;

  const destinationLabel =
    quote?.destinationCity && quote?.destinationState
      ? formatCepCityState({
          city: quote.destinationCity,
          state: quote.destinationState,
        })
      : null;

  useEffect(() => {
    if (!quote) return;
    const options = [sedex, pac].filter(Boolean) as ShippingQuoteOption[];
    if (!options.length) {
      setSelectedCode(null);
      return;
    }
    setSelectedCode((prev) => {
      if (prev && options.some((o) => o.code === prev)) return prev;
      return (sedex ?? pac ?? options[0]!).code;
    });
  }, [quote, pac, sedex]);

  useEffect(() => {
    if (!selectedCode) {
      onSelectionChange?.(null);
      return;
    }
    const opt =
      pac?.code === selectedCode
        ? pac
        : sedex?.code === selectedCode
          ? sedex
          : null;
    onSelectionChange?.(opt);
  }, [selectedCode, pac, sedex, onSelectionChange]);

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

  if (!pac && !sedex) {
    return (
      <p className="mt-3 text-xs text-stone-500">
        Frete indisponível para este CEP no momento.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2" aria-live="polite" role="radiogroup">
      {sedex && (
        <ShippingOptionCard
          option={sedex}
          selected={selectedCode === sedex.code}
          onSelect={() => setSelectedCode(sedex.code)}
        />
      )}
      {pac && (
        <ShippingOptionCard
          option={pac}
          selected={selectedCode === pac.code}
          onSelect={() => setSelectedCode(pac.code)}
        />
      )}
      <div className="space-y-0.5 pt-0.5">
        {destinationLabel ? (
          <p className="text-xs font-semibold text-stone-400">{destinationLabel}</p>
        ) : null}
        <p className="text-[10px] leading-snug text-stone-600">
          Os demais dados para entrega serão solicitados pelo vendedor no WhatsApp.
        </p>
      </div>
    </div>
  );
}
