"use client";

import { useEffect, useState } from "react";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function WizardCatalogHint({ visible, onDismiss }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }
    setShow(true);
    const hide = window.setTimeout(() => setShow(false), 4200);
    const remove = window.setTimeout(onDismiss, 4600);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(remove);
    };
  }, [visible, onDismiss]);

  if (!visible && !show) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[55] flex justify-center px-4"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onDismiss}
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-950/75 px-4 py-3 text-left shadow-lg shadow-black/40 ring-1 ring-emerald-400/20 backdrop-blur-md transition-all duration-500 ease-out ${
          show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300"
          aria-hidden
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
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-emerald-50">
            Pressione a imagem para ver melhor
          </span>
          <span className="mt-0.5 block text-xs text-emerald-200/70">
            Toque na foto do produto para ampliar
          </span>
        </span>
      </button>
    </div>
  );
}
