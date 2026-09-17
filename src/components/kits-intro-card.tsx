"use client";

import { useEffect, useId, useState } from "react";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function KitsIntroCard() {
  const titleId = useId();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px] transition-opacity animate-drop-backdrop"
        aria-label="Fechar"
        onClick={() => setOpen(false)}
      />

      <div className="relative z-[1] flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#121214] shadow-2xl shadow-black/50 ring-1 ring-white/[0.06] animate-drop-sheet sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-end px-4 pt-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-zinc-900/80 text-stone-300 transition hover:border-white/[0.18] hover:bg-zinc-800 hover:text-stone-50"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1 sm:px-8">
          <div className="animate-guided-step-in space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
              KITs PRONTOS
            </p>
            <h2
              id={titleId}
              className="text-balance text-3xl font-semibold tracking-tight text-emerald-400 sm:text-4xl"
            >
              Nossa equipe separa os modelos que mais vendem para você girar seu
              estoque e comprar de novo com a gente.
            </h2>
            <p className="text-sm font-bold leading-relaxed text-stone-100 sm:text-base">
              Você paga mais barato e a gente escolhe as peças certas pra você
              vender rápido!
            </p>
            <p className="text-sm leading-relaxed text-stone-400 sm:text-base">
              Caso você prefira escolher peça por peça, você pode acessar as
              outras categorias e montar seu pedido!
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-4 border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/[0.14] bg-stone-100 text-zinc-900 shadow-lg shadow-black/30 transition hover:bg-white active:scale-95"
            aria-label="Continuar para os kits"
          >
            <ArrowIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
