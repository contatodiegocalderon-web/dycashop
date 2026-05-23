"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product, ProductSize } from "@/types";
import {
  type GuidedWizardSelection,
  wizardBrandOptions,
  wizardColorOptions,
  wizardSizeOptions,
} from "@/lib/catalog-guided-wizard";

type Props = {
  categoryLabel: string;
  onComplete: (selection: GuidedWizardSelection) => void;
};

type WizardStep = 1 | 2 | 3;

function buildCategoryQuery(categoryLabel: string) {
  const p = new URLSearchParams();
  p.set("category", categoryLabel.trim());
  p.set("categoryMatch", "exact");
  return `?${p.toString()}`;
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

function StepProgress({ step }: { step: WizardStep }) {
  const items = [
    { n: 1, label: "Tamanho" },
    { n: 2, label: "Cor" },
    { n: 3, label: "Marca" },
  ] as const;

  return (
    <div className="mb-6 flex items-center justify-center gap-2 sm:gap-3">
      {items.map(({ n, label }, i) => {
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} className="flex items-center gap-2 sm:gap-3">
            {i > 0 ? (
              <div
                className={`h-px w-6 sm:w-10 transition-colors duration-500 ${
                  done ? "bg-emerald-400/70" : "bg-white/10"
                }`}
                aria-hidden
              />
            ) : null}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${
                  done
                    ? "bg-emerald-500/90 text-zinc-950 shadow-[0_0_20px_rgba(52,211,153,0.35)]"
                    : active
                      ? "bg-stone-100 text-zinc-900 ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-zinc-950"
                      : "border border-white/15 bg-white/[0.04] text-stone-500"
                }`}
              >
                {done ? "✓" : n}
              </div>
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  active ? "text-stone-200" : "text-stone-600"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChoiceChip({
  label,
  selected,
  onClick,
  delayMs,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  delayMs: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-pressed={selected}
      className={`animate-guided-chip-in rounded-2xl border px-5 py-3 text-sm font-semibold transition-all duration-300 sm:px-6 sm:py-3.5 sm:text-base ${
        selected
          ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100 shadow-[0_0_24px_rgba(52,211,153,0.12)] ring-1 ring-emerald-400/30"
          : "border-white/10 bg-white/[0.04] text-stone-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

export function CategoryGuidedWizard({ categoryLabel, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [step, setStep] = useState<WizardStep>(1);
  const [size, setSize] = useState<ProductSize | null>(null);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products${buildCategoryQuery(categoryLabel)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar");
      setProducts((data.products ?? []) as Product[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [categoryLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  const sizes = useMemo(() => wizardSizeOptions(products), [products]);
  const colors = useMemo(
    () => (size ? wizardColorOptions(products, size) : []),
    [products, size]
  );
  const brands = useMemo(
    () =>
      size && selectedColors.length > 0
        ? wizardBrandOptions(products, size, selectedColors)
        : [],
    [products, size, selectedColors]
  );

  function pickSize(s: ProductSize) {
    setSize(s);
    setSelectedColors([]);
    setSelectedBrands([]);
    setStep(2);
  }

  function goToBrands() {
    if (selectedColors.length === 0) return;
    setSelectedBrands([]);
    setStep(3);
  }

  function finishWizard() {
    if (!size || selectedColors.length === 0 || selectedBrands.length === 0) {
      return;
    }
    onComplete({
      size,
      colors: selectedColors,
      brands: selectedBrands,
    });
  }

  function goBack() {
    if (step === 3) {
      setSelectedBrands([]);
      setStep(2);
      return;
    }
    if (step === 2) {
      setSize(null);
      setSelectedColors([]);
      setStep(1);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-8 ring-1 ring-white/[0.04]">
        <p className="text-center text-sm text-stone-400">
          A preparar o assistente de compra…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (sizes.length === 0) {
    return (
      <p className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 px-4 py-8 text-center text-sm text-stone-400">
        Nenhum produto disponível nesta categoria no momento.
      </p>
    );
  }

  const stepTitle =
    step === 1
      ? "1º passo — escolha o tamanho que você está procurando"
      : step === 2
        ? "2º passo — escolha a(s) cor(es) de sua preferência"
        : "Pra finalizar — 3º passo, escolha a(s) marca(s)";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/80 via-zinc-950/90 to-black/60 p-5 ring-1 ring-white/[0.05] sm:p-8"
      aria-label="Assistente de compra"
    >
      <StepProgress step={step} />

      <div key={step} className="animate-guided-step-in">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
          {step === 1 ? "Comece aqui" : step === 2 ? "Quase lá" : "Último passo"}
        </p>
        <h2 className="mt-2 text-balance text-center text-lg font-semibold leading-snug text-stone-50 sm:text-xl">
          {stepTitle}
        </h2>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {step === 1 &&
            sizes.map((s, i) => (
              <ChoiceChip
                key={s}
                label={s}
                selected={size === s}
                onClick={() => pickSize(s)}
                delayMs={i * 55}
              />
            ))}
          {step === 2 &&
            colors.map((c, i) => (
              <ChoiceChip
                key={c}
                label={c}
                selected={selectedColors.includes(c)}
                onClick={() =>
                  setSelectedColors((prev) => toggleInList(prev, c))
                }
                delayMs={i * 45}
              />
            ))}
          {step === 3 &&
            brands.map((b, i) => (
              <ChoiceChip
                key={b}
                label={b}
                selected={selectedBrands.includes(b)}
                onClick={() =>
                  setSelectedBrands((prev) => toggleInList(prev, b))
                }
                delayMs={i * 45}
              />
            ))}
        </div>

        {step === 2 && colors.length === 0 && (
          <p className="mt-6 text-center text-sm text-stone-500">
            Nenhuma cor disponível para o tamanho {size}.{" "}
            <button
              type="button"
              onClick={goBack}
              className="font-medium text-stone-300 underline underline-offset-2 hover:text-white"
            >
              Voltar
            </button>
          </p>
        )}

        {step === 3 && brands.length === 0 && (
          <p className="mt-6 text-center text-sm text-stone-500">
            Nenhuma marca disponível para esta combinação.{" "}
            <button
              type="button"
              onClick={goBack}
              className="font-medium text-stone-300 underline underline-offset-2 hover:text-white"
            >
              Voltar
            </button>
          </p>
        )}

        {step === 2 && colors.length > 0 && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled={selectedColors.length === 0}
              onClick={goToBrands}
              className="rounded-2xl bg-stone-100 px-8 py-3 text-sm font-bold text-zinc-900 shadow-lg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuar
              {selectedColors.length > 0
                ? ` (${selectedColors.length} cor${selectedColors.length > 1 ? "es" : ""})`
                : ""}
            </button>
          </div>
        )}

        {step === 3 && brands.length > 0 && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled={selectedBrands.length === 0}
              onClick={finishWizard}
              className="rounded-2xl bg-emerald-500 px-8 py-3 text-sm font-bold text-zinc-950 shadow-[0_0_28px_rgba(52,211,153,0.25)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ver produtos
              {selectedBrands.length > 0
                ? ` (${selectedBrands.length} marca${selectedBrands.length > 1 ? "s" : ""})`
                : ""}
            </button>
          </div>
        )}
      </div>

      {step > 1 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={goBack}
            className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-200"
          >
            ← Voltar ao passo anterior
          </button>
        </div>
      )}
    </section>
  );
}
