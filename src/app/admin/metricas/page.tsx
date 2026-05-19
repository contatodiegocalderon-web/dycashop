"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";

import { AdminPurpleCard, AdminPurpleStatCard } from "@/components/admin/admin-purple-card";
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
  | "today"
  | "yesterday"
  | "weekly"
  | "monthly"
  | "yearly"
  | "last7"
  | "last30"
  | "all"
  | "dateRange";

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

type SellerFilterOption = { value: string; label: string };

export default function AdminMetricasPage() {
  const { adminFetch, isOwner, session } = useAdminAuth();
  const isDiegoOwnerUi = session?.role === "owner" && session?.fromApiKey !== true;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [sellerBreakdown, setSellerBreakdown] = useState<SellerBreakdownRow[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [dateFrom, setDateFrom] = useState<string>(todayYmd());
  const [dateTo, setDateTo] = useState<string>(todayYmd());
  const [sellerScope, setSellerScope] = useState<string>("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<SellerFilterOption[]>([]);
  const [periodDescription, setPeriodDescription] = useState<string | null>(null);
  const [loadMeta, setLoadMeta] = useState<{
    ordersIncluded: number;
    ordersWithSale: number;
    totalPieces: number;
  } | null>(null);
  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        period,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        _: String(Date.now()),
      });
      if (period === "dateRange") {
        if (dateFrom) q.set("dateFrom", dateFrom);
        if (dateTo) q.set("dateTo", dateTo);
      }
      if (isDiegoOwnerUi && sellerScope && sellerScope !== "all") {
        q.set("sellerScope", sellerScope);
      }
      const mRes = await adminFetch(`/api/admin/metrics?${q.toString()}`);
      const mJson = await mRes.json();
      if (!mRes.ok) throw new Error(mJson.error ?? "Falha nas métricas");
      setMetrics(mJson.metrics as MetricsPayload);
      setPeriodDescription(
        typeof mJson.periodDescription === "string" ? mJson.periodDescription : null
      );
      const meta = mJson.meta as
        | {
            ordersIncluded?: number;
            ordersWithSale?: number;
            totalPieces?: number;
          }
        | undefined;
      setLoadMeta(
        meta && typeof meta.ordersIncluded === "number"
          ? {
              ordersIncluded: meta.ordersIncluded,
              ordersWithSale: Number(meta.ordersWithSale ?? 0),
              totalPieces: Number(meta.totalPieces ?? 0),
            }
          : null
      );
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
      setPeriodDescription(null);
      setLoadMeta(null);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, period, dateFrom, dateTo, isDiegoOwnerUi, sellerScope]);

  useEffect(() => {
    if (!isDiegoOwnerUi) {
      setSellerScope("all");
      setSellerFilterOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await adminFetch("/api/admin/staff-seller-filters");
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as {
          ownerStaffId?: string | null;
          ownerDisplayName?: string;
          sellers?: Array<{ id: string; displayName: string }>;
        };
        const opts: SellerFilterOption[] = [{ value: "all", label: "Todos" }];
        if (j.ownerStaffId) {
          opts.push({
            value: "me",
            label: String(j.ownerDisplayName ?? "Dono").trim() || "Dono",
          });
        }
        for (const s of j.sellers ?? []) {
          opts.push({
            value: s.id,
            label: String(s.displayName ?? "").trim() || "Vendedor",
          });
        }
        if (!cancelled) setSellerFilterOptions(opts);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetch, isDiegoOwnerUi]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

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
          {periodDescription && (
            <p className="mt-1 text-xs text-stone-500">{periodDescription}</p>
          )}
          {loadMeta && (
            <p className="mt-1 text-xs text-stone-500">
              {loadMeta.ordersIncluded} venda(s) confirmada(s) no período ·{" "}
              {loadMeta.totalPieces} peça(s)
            </p>
          )}
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
          {isDiegoOwnerUi && sellerFilterOptions.length > 0 && (
            <select
              value={sellerScope}
              onChange={(e) => setSellerScope(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
              aria-label="Filtrar métricas por vendedor"
            >
              {sellerFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Todo período</option>
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
            <option value="last7">Últimos 7 dias</option>
            <option value="last30">Últimos 30 dias</option>
            <option value="dateRange">Período personalizado</option>
          </select>
          {period === "dateRange" && (
            <>
              <label className="flex flex-col gap-0.5 text-xs text-stone-600">
                De
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-stone-600">
                Até
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                />
              </label>
            </>
          )}
          <button
            type="button"
            onClick={loadMetrics}
            disabled={loading}
            className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "A atualizar…" : "Atualizar dados"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {metrics && (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminPurpleStatCard
            label="Vendas"
            value={String(metrics.orderCount)}
            sub="Pedidos com valor registado"
          />
          <AdminPurpleStatCard
            label="Ticket médio"
            value={money(metrics.averageTicket)}
            sub="Por pedido"
          />
          <AdminPurpleStatCard
            label="Faturamento"
            value={money(metrics.totalRevenue)}
            sub="Total"
          />
          <AdminPurpleStatCard
            label="Lucro estimado"
            value={money(metrics.totalProfit)}
            sub="Com base nos custos"
          />
        </div>
      )}

      {metrics && (
        <div className="mb-10 grid gap-8 lg:grid-cols-3">
          <AdminPurpleCard className="p-6">
            <h2 className="text-center text-sm font-bold uppercase tracking-wide text-white">
              Segmento de cliente
            </h2>
            <p className="mt-1 text-center text-xs text-violet-100/70">
              Pedidos confirmados (novo vs antigo)
            </p>
            {segmentPieData.some((d) => d.value > 0) ? (
              <SegmentPieChart data={segmentPieData} theme="purple" />
            ) : (
              <p className="py-12 text-center text-sm text-violet-100/60">
                Sem dados de segmento neste período.
              </p>
            )}
          </AdminPurpleCard>
          <AdminPurpleCard className="p-6 lg:col-span-2">
            <div className="grid gap-8 md:grid-cols-2">
              {piecesPieEntries && piecesPieEntries.length > 0 && (
                <CategoryPieChart
                  title="Peças por categoria"
                  entries={piecesPieEntries}
                  theme="purple"
                />
              )}
              {revenuePieEntries && revenuePieEntries.length > 0 && (
                <CategoryPieChart
                  title="Faturamento por categoria (rateio)"
                  entries={revenuePieEntries}
                  valuePrefix="R$"
                  theme="purple"
                />
              )}
            </div>
          </AdminPurpleCard>
        </div>
      )}

      {metrics && sortedCategories.length > 0 && (
        <AdminPurpleCard className="mb-10 overflow-hidden">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="font-bold text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              Detalhe por categoria
            </h2>
            <p className="text-xs text-violet-100/70">
              Faturamento repartido pelo número de peças no pedido.
            </p>
          </div>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-violet-200/70">
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3">Categoria</th>
                  <th className="px-6 py-3">Peças</th>
                  <th className="px-6 py-3">Faturado</th>
                  <th className="px-6 py-3">Lucro (rateio)</th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map(([cat, pieces]) => (
                  <tr key={cat} className="border-b border-white/10 last:border-0">
                    <td className="px-6 py-3 font-semibold text-white">{cat}</td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">{pieces}</td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">
                      {money(metrics.revenueByCategory[cat] ?? 0)}
                    </td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">
                      {money(metrics.profitByCategory[cat] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPurpleCard>
      )}

      {isOwner && sellerBreakdown.length > 0 && (
        <AdminPurpleCard className="mb-10 overflow-hidden">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="font-bold text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              Desempenho por vendedor
            </h2>
            <p className="text-xs text-violet-100/70">
              Faturamento, lucro e categoria mais vendida por vendedor.
            </p>
          </div>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-violet-200/70">
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3">Vendedor</th>
                  <th className="px-6 py-3">Vendas</th>
                  <th className="px-6 py-3">Faturamento</th>
                  <th className="px-6 py-3">Lucro</th>
                  <th className="px-6 py-3">Categoria mais vendida</th>
                </tr>
              </thead>
              <tbody>
                {sellerBreakdown.map((s) => (
                  <tr key={s.staffId} className="border-b border-white/10 last:border-0">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-white">{s.staffName}</p>
                      <p className="text-xs text-violet-100/65">{s.staffEmail}</p>
                    </td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">{s.orderCount}</td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">
                      {money(s.totalRevenue)}
                    </td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">
                      {money(s.totalProfit)}
                    </td>
                    <td className="px-6 py-3 font-medium text-violet-50/90">
                      {s.topCategory ? `${s.topCategory} (${s.topCategoryPieces})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPurpleCard>
      )}

    </div>
  );
}
