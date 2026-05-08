"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";

import {
  CategoryPieChart,
  SegmentPieChart,
  type NamedValue,
} from "@/components/admin/metrics-charts";

type MetricsPayload = {
  orderCount: number;
  totalRevenue: number;
  totalProfit: number;
  averageTicket: number;
  topCategoryByPieces: string | null;
  piecesByCategory: Record<string, number>;
  revenueByCategory: Record<string, number>;
  profitByCategory: Record<string, number>;
  novoCount: number;
  antigoCount: number;
};

type SellerBreakdownRow = {
  staffId: string;
  staffName: string;
  staffEmail: string;
  orderCount: number;
  totalRevenue: number;
  totalProfit: number;
  topCategory: string | null;
  topCategoryPieces: number;
};

type PeriodKey =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "last30"
  | "all"
  | "selectedDate";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function AdminMetricasPage() {
  const { adminFetch, isOwner, session } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [sellerBreakdown, setSellerBreakdown] = useState<SellerBreakdownRow[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd());
  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ period });
      if (period === "selectedDate" && selectedDate) {
        q.set("selectedDate", selectedDate);
        q.set("tzOffsetMinutes", String(new Date().getTimezoneOffset()));
      }
      const mRes = await adminFetch(`/api/admin/metrics?${q.toString()}`);
      const mJson = await mRes.json();
      if (!mRes.ok) throw new Error(mJson.error ?? "Falha nas métricas");
      setMetrics(mJson.metrics as MetricsPayload);
      const rows = (mJson.sellerBreakdown ?? []) as Array<{
        staffId: string;
        staffName: string;
        staffEmail: string;
        orderCount: number;
        totalRevenue: number;
        totalProfit: number;
        topProduct?: string | null;
        topProductPieces?: number;
      }>;
      setSellerBreakdown(
        rows.map((r) => ({
          staffId: r.staffId,
          staffName: r.staffName,
          staffEmail: r.staffEmail,
          orderCount: r.orderCount,
          totalRevenue: r.totalRevenue,
          totalProfit: r.totalProfit,
          topCategory: r.topProduct ?? null,
          topCategoryPieces: r.topProductPieces ?? 0,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setMetrics(null);
      setSellerBreakdown([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, period, selectedDate]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  async function resetMetrics() {
    if (!isOwner) return;
    setResetting(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/metrics/reset", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao zerar métricas");
      await loadMetrics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setResetting(false);
    }
  }

  const sortedCategories = Object.entries(metrics?.piecesByCategory ?? {}).sort(
    (a, b) => b[1] - a[1]
  );

  const segmentPieData: NamedValue[] = metrics
    ? [
        { name: "Cliente novo", value: metrics.novoCount },
        { name: "Cliente antigo", value: metrics.antigoCount },
      ]
    : [];

  const piecesPieEntries =
    metrics?.piecesByCategory &&
    Object.entries(metrics.piecesByCategory).map(([name, value]) => ({
      name,
      value,
    }));

  const revenuePieEntries =
    metrics?.revenueByCategory &&
    Object.entries(metrics.revenueByCategory).map(([name, value]) => ({
      name,
      value,
    }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Métricas de vendas
          </h1>
          <p className="mt-1 max-w-xl text-sm text-stone-600">
            Lucro = valor da venda menos (peças × custo da categoria). Configure custos e
            conteúdo por categoria na aba{" "}
            <Link href="/admin/categorias" className="font-medium text-violet-800 underline">
              Categorias
            </Link>
            .
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/admin/pedidos" className="font-medium text-violet-800 underline">
              Pedidos pendentes
            </Link>
            <Link href="/admin/clientes" className="font-medium text-violet-800 underline">
              Clientes registados
            </Link>
          </div>
          {!isOwner && (
            <p className="mt-2 text-xs text-stone-500">
              Sessão vendedor: {session?.email}. Esta tela mostra apenas suas vendas.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Todo período</option>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
            <option value="last30">Últimos 30 dias</option>
            <option value="selectedDate">Data específica</option>
          </select>
          {period === "selectedDate" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
            />
          )}
          <button
            type="button"
            onClick={loadMetrics}
            disabled={loading}
            className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "A atualizar…" : "Atualizar dados"}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => void resetMetrics()}
              disabled={resetting}
              className="rounded-xl border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
            >
              {resetting ? "A zerar…" : "Zerar métricas"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {metrics && (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Vendas",
              value: String(metrics.orderCount),
              sub: "Pedidos com valor registado",
              gradient: "from-violet-500/90 to-fuchsia-600",
            },
            {
              label: "Ticket médio",
              value: money(metrics.averageTicket),
              sub: "Por pedido",
              gradient: "from-sky-500/90 to-blue-600",
            },
            {
              label: "Faturamento",
              value: money(metrics.totalRevenue),
              sub: "Total",
              gradient: "from-violet-500/90 to-purple-700",
            },
            {
              label: "Lucro estimado",
              value: money(metrics.totalProfit),
              sub: "Com base nos custos",
              gradient: "from-amber-500/90 to-orange-600",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-white p-5 shadow-xl shadow-stone-900/10"
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br opacity-40 blur-2xl ${card.gradient}`}
              />
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                {card.label}
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-stone-950">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-stone-500">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {metrics && (
        <div className="mb-10 grid gap-8 lg:grid-cols-3">
          <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-lg shadow-stone-900/5">
            <h2 className="text-center text-sm font-bold uppercase tracking-wide text-stone-700">
              Segmento de cliente
            </h2>
            <p className="mt-1 text-center text-xs text-stone-500">
              Pedidos confirmados (novo vs antigo)
            </p>
            {segmentPieData.some((d) => d.value > 0) ? (
              <SegmentPieChart data={segmentPieData} />
            ) : (
              <p className="py-12 text-center text-sm text-stone-500">
                Sem dados de segmento neste período.
              </p>
            )}
          </div>
          <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-lg shadow-stone-900/5 lg:col-span-2">
            <div className="grid gap-8 md:grid-cols-2">
              {piecesPieEntries && piecesPieEntries.length > 0 && (
                <CategoryPieChart
                  title="Peças por categoria"
                  entries={piecesPieEntries}
                />
              )}
              {revenuePieEntries && revenuePieEntries.length > 0 && (
                <CategoryPieChart
                  title="Faturamento por categoria (rateio)"
                  entries={revenuePieEntries}
                  valuePrefix="R$"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {metrics && sortedCategories.length > 0 && (
        <div className="mb-10 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-lg shadow-stone-900/5">
          <div className="border-b border-stone-200 bg-stone-100 px-6 py-4">
            <h2 className="font-bold text-stone-950">Detalhe por categoria</h2>
            <p className="text-xs text-stone-700">
              Faturamento repartido pelo número de peças no pedido.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-stone-700">
                <tr className="border-b border-stone-200">
                  <th className="px-6 py-3">Categoria</th>
                  <th className="px-6 py-3">Peças</th>
                  <th className="px-6 py-3">Faturado</th>
                  <th className="px-6 py-3">Lucro (rateio)</th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map(([cat, pieces]) => (
                  <tr key={cat} className="border-b border-stone-100 last:border-0">
                    <td className="px-6 py-3 font-semibold text-stone-950">{cat}</td>
                    <td className="px-6 py-3 font-medium text-stone-900">{pieces}</td>
                    <td className="px-6 py-3 font-medium text-stone-900">
                      {money(metrics.revenueByCategory[cat] ?? 0)}
                    </td>
                    <td className="px-6 py-3 font-medium text-stone-900">
                      {money(metrics.profitByCategory[cat] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isOwner && sellerBreakdown.length > 0 && (
        <div className="mb-10 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-lg shadow-stone-900/5">
          <div className="border-b border-stone-200 bg-stone-100 px-6 py-4">
            <h2 className="font-bold text-stone-950">Desempenho por vendedor</h2>
            <p className="text-xs text-stone-700">
              Faturamento, lucro e categoria mais vendida por vendedor.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-stone-700">
                <tr className="border-b border-stone-200">
                  <th className="px-6 py-3">Vendedor</th>
                  <th className="px-6 py-3">Vendas</th>
                  <th className="px-6 py-3">Faturamento</th>
                  <th className="px-6 py-3">Lucro</th>
                  <th className="px-6 py-3">Categoria mais vendida</th>
                </tr>
              </thead>
              <tbody>
                {sellerBreakdown.map((s) => (
                  <tr key={s.staffId} className="border-b border-stone-100 last:border-0">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-stone-950">{s.staffName}</p>
                      <p className="text-xs text-stone-700">{s.staffEmail}</p>
                    </td>
                    <td className="px-6 py-3 font-medium text-stone-900">{s.orderCount}</td>
                    <td className="px-6 py-3 font-medium text-stone-900">{money(s.totalRevenue)}</td>
                    <td className="px-6 py-3 font-medium text-stone-900">{money(s.totalProfit)}</td>
                    <td className="px-6 py-3 font-medium text-stone-900">
                      {s.topCategory ? `${s.topCategory} (${s.topCategoryPieces})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
