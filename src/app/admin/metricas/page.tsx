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

type CostRow = {
  category_label: string;
  cost_per_piece: number;
  updated_at?: string | null;
};

function money(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function AdminMetricasPage() {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [costEdits, setCostEdits] = useState<Record<string, string>>({});
  const [savingCosts, setSavingCosts] = useState(false);
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, cRes] = await Promise.all([
        adminFetch("/api/admin/metrics"),
        adminFetch("/api/admin/category-costs"),
      ]);

      const mJson = await mRes.json();
      const cJson = await cRes.json();

      if (!mRes.ok) throw new Error(mJson.error ?? "Falha nas métricas");
      if (!cRes.ok) throw new Error(cJson.error ?? "Falha nos custos");

      setMetrics(mJson.metrics as MetricsPayload);
      const rows = (cJson.rows ?? []) as CostRow[];
      setCostRows(rows);
      const edits: Record<string, string> = {};
      for (const r of rows) {
        edits[r.category_label] = String(r.cost_per_piece);
      }
      setCostEdits(edits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function saveCosts() {
    setSavingCosts(true);
    setError(null);
    try {
      const entries = Object.entries(costEdits).map(([category_label, v]) => ({
        category_label,
        cost_per_piece: Number(String(v).replace(",", ".")),
      }));
      const res = await adminFetch("/api/admin/category-costs", {
        method: "PUT",
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingCosts(false);
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
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Métricas de vendas
          </h1>
          <p className="mt-1 max-w-xl text-sm text-stone-600">
            Lucro = valor da venda menos (peças × custo da categoria). Categorias vêm do catálogo
            importado — só indique o custo por peça.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/admin/pedidos" className="font-medium text-emerald-800 underline">
              Pedidos pendentes
            </Link>
            <Link href="/admin/clientes" className="font-medium text-emerald-800 underline">
              Clientes registados
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ? "A atualizar…" : "Atualizar dados"}
        </button>
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
              gradient: "from-emerald-500/90 to-teal-600",
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
              <p className="mt-2 text-2xl font-bold text-stone-900">{card.value}</p>
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
          <div className="border-b border-stone-100 bg-stone-50/80 px-6 py-4">
            <h2 className="font-bold text-stone-900">Detalhe por categoria</h2>
            <p className="text-xs text-stone-500">
              Faturamento repartido pelo número de peças no pedido.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr className="border-b border-stone-100">
                  <th className="px-6 py-3">Categoria</th>
                  <th className="px-6 py-3">Peças</th>
                  <th className="px-6 py-3">Faturado</th>
                  <th className="px-6 py-3">Lucro (rateio)</th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map(([cat, pieces]) => (
                  <tr key={cat} className="border-b border-stone-50 last:border-0">
                    <td className="px-6 py-3 font-medium text-stone-900">{cat}</td>
                    <td className="px-6 py-3">{pieces}</td>
                    <td className="px-6 py-3">
                      {money(metrics.revenueByCategory[cat] ?? 0)}
                    </td>
                    <td className="px-6 py-3">
                      {money(metrics.profitByCategory[cat] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-stone-200 bg-gradient-to-b from-white to-stone-50 p-6 shadow-lg shadow-stone-900/5">
        <h2 className="text-xl font-bold text-stone-900">Custo por categoria</h2>
        <p className="mt-1 text-sm text-stone-600">
          Lista gerada automaticamente a partir das categorias dos produtos importados. Preencha o
          custo por peça e guarde.
        </p>
        {costRows.length === 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            Ainda não há produtos no catálogo — sincronize o Drive em{" "}
            <Link href="/admin/configuracao" className="font-medium underline">
              Catálogo &amp; Drive
            </Link>
            .
          </p>
        ) : (
          <>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {costRows.map((row) => (
                <li
                  key={row.category_label}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-100 bg-white px-4 py-3 shadow-sm"
                >
                  <span className="font-medium text-stone-800">{row.category_label}</span>
                  <label className="flex items-center gap-2 text-sm text-stone-600">
                    R$ / peça
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!isOwner}
                      value={costEdits[row.category_label] ?? ""}
                      onChange={(e) =>
                        setCostEdits((prev) => ({
                          ...prev,
                          [row.category_label]: e.target.value,
                        }))
                      }
                      className="w-28 rounded-xl border border-stone-200 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                    />
                  </label>
                </li>
              ))}
            </ul>
            {isOwner && (
              <button
                type="button"
                onClick={saveCosts}
                disabled={savingCosts}
                className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingCosts ? "A guardar…" : "Guardar custos"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
