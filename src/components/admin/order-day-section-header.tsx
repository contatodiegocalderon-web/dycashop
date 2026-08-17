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

function StatLine({ label, pair }: { label: string; pair: DayMoneyPair }) {
  return (
    <p className="whitespace-nowrap text-[11px] font-semibold tracking-wide text-violet-50/95 sm:text-xs">
      {label}- F({formatBrl(pair.faturamento)}) L({formatBrl(pair.lucro)})
    </p>
  );
}

export function SegmentPeriodStats({ stats }: { stats: OrderDaySectionStats }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 normal-case">
      <StatLine label="NOVOS" pair={stats.novos} />
      <StatLine label="ANTIGOS" pair={stats.antigos} />
      <StatLine label="TOTAL" pair={stats.total} />
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
