"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  DROP_CALC_DEFAULT_QTY_PER_MONTH,
  DROP_CALC_DEFAULT_SALE_BRL,
  DROP_CATALOG_DRIVE_URL,
  DROP_CHECKOUT_URL,
  DROP_MEMBER_PRICE_ROWS,
  DROP_MONTHLY_PRICE_BRL,
  DROP_WHOLESALE_UNIT_BRL,
} from "@/lib/dropshipping";

const STEPS = 5;
const TRACK = "#3f3f46"; // zinc-700
const FILL = "#a8a29e"; // stone-400

function money(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

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

function rangeFill(pct: number) {
  const p = Math.min(100, Math.max(0, pct));
  return `linear-gradient(to right, ${FILL} 0%, ${FILL} ${p}%, ${TRACK} ${p}%, ${TRACK} 100%)`;
}

function ProfitCalculator() {
  const cost = DROP_WHOLESALE_UNIT_BRL;
  const [qty, setQty] = useState(DROP_CALC_DEFAULT_QTY_PER_MONTH);
  const [sale, setSale] = useState(DROP_CALC_DEFAULT_SALE_BRL);

  const saleMin = cost + 5;
  const saleMax = 150;
  const profitEach = Math.max(0, sale - cost);
  const monthTotal = profitEach * Math.max(0, qty);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-zinc-900/70 px-3.5 py-3 ring-1 ring-white/[0.04]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Calculadora
        </p>
        <p className="text-[11px] text-stone-500">
          Custo {money(cost)}/peça
        </p>
      </div>

      <div className="mt-2.5 space-y-2.5">
        <label className="block">
          <span className="flex items-baseline justify-between gap-2 text-[12px] text-stone-300">
            <span>Camisetas no mês</span>
            <span className="font-semibold tabular-nums text-stone-100">{qty}</span>
          </span>
          <input
            type="range"
            min={1}
            max={120}
            step={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="drop-calc-range mt-1.5 w-full"
            style={{ background: rangeFill(((qty - 1) / 119) * 100) }}
            aria-label="Camisetas no mês"
          />
        </label>

        <label className="block">
          <span className="flex items-baseline justify-between gap-2 text-[12px] text-stone-300">
            <span>Vendendo cada por</span>
            <span className="font-semibold tabular-nums text-stone-100">
              {money(sale)}
            </span>
          </span>
          <input
            type="range"
            min={saleMin}
            max={saleMax}
            step={1}
            value={sale}
            onChange={(e) => setSale(Number(e.target.value))}
            className="drop-calc-range mt-1.5 w-full"
            style={{
              background: rangeFill(
                ((sale - saleMin) / (saleMax - saleMin)) * 100
              ),
            }}
            aria-label="Preço de venda"
          />
        </label>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-stone-500">
            Lucro / peça
          </p>
          <p className="text-sm font-semibold tabular-nums text-stone-200">
            {money(profitEach)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-stone-500">
            Lucro no mês
          </p>
          <p
            key={monthTotal}
            className="text-lg font-semibold tabular-nums tracking-tight text-emerald-400 animate-drop-calc-pop"
          >
            {money(monthTotal)}
          </p>
        </div>
      </div>
    </div>
  );
}

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 0:
      return (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Venda sem estoque
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
            Revenda com o nosso estoque. Zero risco de mercadoria travada.
          </h2>
          <p className="text-sm leading-relaxed text-stone-400 sm:text-base">
            Você divulga, vende e só compra o que já saiu. Sem custo operacional e
            pagando preço mínimo em 1 peça.
          </p>
          <ul className="space-y-3 text-sm text-stone-300">
            {[
              "Dinheiro não fica travado em produto",
              "Margem de lucro boa graças ao preço exclusivo",
              "Alta variedade de produtos sem investir milhares em estoque",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-500"
                  aria-hidden
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <ProfitCalculator />
        </div>
      );
    case 1:
      return (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            O maior benefício
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
            Preço de atacado. Em 1 peça.
          </h2>
          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/60 ring-1 ring-white/[0.04]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-2 font-semibold">Produto</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    Seu preço
                  </th>
                </tr>
              </thead>
              <tbody>
                {DROP_MEMBER_PRICE_ROWS.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-white/[0.05] last:border-0"
                  >
                    <td className="px-4 py-2 font-medium text-stone-200">
                      {row.label}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-400">
                      {money(row.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-sm font-medium text-stone-300">
            Preço atacado exclusivo pra membros!
          </p>
        </div>
      );
    case 2:
      return (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Como funciona
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
            Quatro passos. Você só vende.
          </h2>
          <ol className="space-y-3">
            {[
              {
                n: "01",
                t: "Assina o plano",
                d: `Acesso completo por R$${DROP_MONTHLY_PRICE_BRL}/mês.`,
              },
              {
                n: "02",
                t: "Divulga o catálogo",
                d: "Milhares de produtos a pronta entrega",
              },
              {
                n: "03",
                t: "Vendeu? Faz o pedido",
                d: "Compra só o que já saiu, pagando preço exclusivo — 1 peça ou 100.",
              },
              {
                n: "04",
                t: "A gente despacha",
                d: "Separação e envio. Seu cliente recebe rápido.",
              },
            ].map((row) => (
              <li key={row.n} className="flex gap-4">
                <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-stone-500">
                  {row.n}
                </span>
                <div>
                  <p className="font-medium text-stone-100">{row.t}</p>
                  <p className="mt-0.5 text-sm text-stone-400">{row.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="rounded-xl border border-white/[0.1] bg-gradient-to-br from-zinc-700/50 via-zinc-800/70 to-zinc-950/90 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              Área de membros
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-stone-200">
              Ao entrar no plano você recebe acesso à nossa área de membros, com
              todas as instruções detalhadas de como realizar as vendas, além de
              estratégias e aulas para alavancar seus resultados — desde
              posicionamento nas redes até tráfego pago.
            </p>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="space-y-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Seu material de venda
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
            Catálogo sem marca. Pronto pra divulgar.
          </h2>
          <p className="text-sm leading-relaxed text-stone-400 sm:text-base">
            Link com os produtos do site — sem branding DYCASHOP — pra você mostrar
            pro seu cliente. Preço de atacado na tela gera desejo e fecha venda.
          </p>
          <a
            href={DROP_CATALOG_DRIVE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-zinc-800/90 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-stone-100 transition hover:border-white/[0.2] hover:bg-zinc-700 active:scale-[0.99]"
          >
            Ver catálogo
          </a>
          <p className="text-center text-xs leading-relaxed text-stone-500">
            Abra, role as pastas e sinta o volume: milhares de peças atualizadas.
            No plano, esse material fica liberado pra você usar nas vendas.
          </p>
          <p className="text-center text-sm font-medium leading-relaxed tracking-tight text-stone-100">
            Esse link contém todos os produtos do site, conectado e atualizado em
            tempo real para não ter conflito de estoque com os revendedores.
          </p>
        </div>
      );
    case 4:
    default:
      return (
        <div className="space-y-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Acesso mensal
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
            R${DROP_MONTHLY_PRICE_BRL}
            <span className="text-xl font-medium text-stone-500">/mês</span>
          </h2>
          <p className="text-sm leading-relaxed text-stone-400 sm:text-base">
            Valor simbólico frente a estoque, aluguel, contas, equipe e risco. Por
            R${DROP_MONTHLY_PRICE_BRL} você usa a estrutura pronta — e compra só
            quando vender.
          </p>
          <ul className="space-y-2.5 text-sm text-stone-300">
            {[
              `Atacado em 1 peça (camisetas e bermudas R$${DROP_WHOLESALE_UNIT_BRL})`,
              "Preço exclusivo pra alta quantidade",
              "Link de catálogo sem marca pra divulgar",
              "Compra só depois de vender · sem pedido mínimo",
              "Despacho com a nossa operação",
              "Cancele quando quiser",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80"
                  aria-hidden
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <a
            href={DROP_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-white transition hover:bg-emerald-500 active:scale-[0.99]"
          >
            Quero vender sem estoque
          </a>
          <p className="text-center text-xs text-stone-500">
            Pagamento seguro · acesso liberado após a assinatura
          </p>
        </div>
      );
  }
}

function FunnelModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const [step, setStep] = useState(0);
  const last = step >= STEPS - 1;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const goNext = useCallback(() => {
    if (last) {
      window.open(DROP_CHECKOUT_URL, "_blank", "noopener,noreferrer");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS - 1));
  }, [last]);

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
        onClick={onClose}
      />

      <div className="relative z-[1] flex h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#121214] shadow-2xl shadow-black/50 ring-1 ring-white/[0.06] animate-drop-sheet sm:h-[min(90dvh,720px)] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-end px-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-zinc-900/80 text-stone-300 transition hover:border-white/[0.18] hover:bg-zinc-800 hover:text-stone-50"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1 sm:px-8">
          <div key={step} className="animate-guided-step-in">
            <span id={titleId} className="sr-only">
              Etapa {step + 1} de {STEPS}
            </span>
            <StepContent step={step} />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2" role="tablist" aria-label="Progresso">
            {Array.from({ length: STEPS }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Ir para etapa ${i + 1}`}
                onClick={() => setStep(i)}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-7 bg-stone-100"
                    : i < step
                      ? "w-2.5 bg-stone-500 hover:bg-stone-400"
                      : "w-2.5 bg-stone-700 hover:bg-stone-600"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/[0.14] bg-stone-100 text-zinc-900 shadow-lg shadow-black/30 transition hover:bg-white active:scale-95"
            aria-label={last ? "Assinar agora" : "Próxima etapa"}
          >
            <ArrowIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DropshippingCta() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="w-full">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-white/[0.1] bg-zinc-800/90 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-stone-100 shadow-inner shadow-black/25 transition hover:border-white/[0.16] hover:bg-zinc-700 active:scale-[0.99]"
        >
          Venda sem estoque
        </button>
      </section>

      <FunnelModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
