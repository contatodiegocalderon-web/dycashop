"use client";

import { useState } from "react";
import { adminPurpleCardStyle } from "@/components/admin/admin-purple-card";

export type DayMoneyPair = {
  faturamento: number;
  lucro: number;
};

export type OrderDaySectionStats = {
  novos: DayMoneyPair;
  antigos: DayMoneyPair;
  total: DayMoneyPair;
};

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ConcealedLucro({ value }: { value: number }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((v) => !v);
      }}
      aria-pressed={revealed}
      title={revealed ? "Clique para embaçar" : "Clique para revelar"}
      className="group inline rounded px-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
    >
      <span
        className={`inline-block transition-[filter,opacity] duration-300 ease-out ${
          revealed
            ? "blur-0 opacity-100"
            : "blur-md opacity-75 saturate-50 group-hover:blur-sm group-hover:opacity-85"
        }`}
      >
        {formatBrl(value)}
      </span>
    </button>
  );
}

function StatLine({
  label,
  pair,
  concealLucro,
}: {
  label: string;
  pair: DayMoneyPair;
  concealLucro?: boolean;
}) {
  return (
    <p className="whitespace-nowrap text-[11px] font-semibold tracking-wide text-violet-50/95 sm:text-xs">
      {label}- F({formatBrl(pair.faturamento)}) L(
      {concealLucro ? <ConcealedLucro value={pair.lucro} /> : formatBrl(pair.lucro)})
    </p>
  );
}

export function SegmentPeriodStats({
  stats,
  concealLucro = false,
}: {
  stats: OrderDaySectionStats;
  concealLucro?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 normal-case">
      <StatLine label="NOVOS" pair={stats.novos} concealLucro={concealLucro} />
      <StatLine label="ANTIGOS" pair={stats.antigos} concealLucro={concealLucro} />
      <StatLine label="TOTAL" pair={stats.total} concealLucro={concealLucro} />
    </div>
  );
}

export function OrderDaySectionHeader({
  label,
  stats,
}: {
  label: string;
  stats?: OrderDaySectionStats;
}) {
  return (
    <header
      className="sticky top-0 z-10 -mx-1 rounded-xl border border-violet-400/30 px-3 py-2.5 text-center text-white shadow-md shadow-violet-950/25 ring-1 ring-inset ring-white/15 backdrop-blur-sm"
      style={adminPurpleCardStyle}
    >
      <h2 className="text-lg font-bold uppercase tracking-wide">{label}</h2>
      {stats ? <SegmentPeriodStats stats={stats} /> : null}
    </header>
  );
}
