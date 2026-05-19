"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPurpleCard, AdminPurpleStatCard } from "@/components/admin/admin-purple-card";
import { CategoryPieChart } from "@/components/admin/metrics-charts";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { CategoryStockSummary, StockInventorySnapshot } from "@/lib/stock-inventory";

type ApiPayload = StockInventorySnapshot & {
  driveSettingsUpdatedAt?: string | null;
  productRows?: number;
  generatedAt?: string;
  error?: string;
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function AdminEstoquePage() {
  const router = useRouter();
  const { adminFetch, isOwner, session } = useAdminAuth();
  const isOwnerStaff =
    session?.role === "owner" && session?.fromApiKey !== true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiPayload | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ _: String(Date.now()) });
      const res = await adminFetch(`/api/admin/stock-inventory?${q.toString()}`);
      const json = (await res.json()) as ApiPayload;
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar estoque");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    if (!isOwner) {
      router.replace("/admin/pedidos");
      return;
    }
    void load();
  }, [isOwner, router, load]);

  const chartEntries = useMemo(
    () =>
      (data?.categories ?? []).map((c) => ({
        name: c.category,
        value: c.pieces,
      })),
    [data?.categories]
  );

  function toggleCategory(cat: string) {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-stone-600">
        A redirecionar…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Controle de estoque
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Visão só para o dono. O total de peças por categoria é a soma do stock de
            cada produto no catálogo (cada foto no Drive = um produto com a sua
            quantidade). Atualiza automaticamente após{" "}
            <Link
              href="/admin/configuracao"
              className="font-medium text-violet-800 underline"
            >
              importar do Drive
            </Link>
            .
          </p>
          {isOwnerStaff && (
            <p className="mt-1 text-xs text-stone-500">
              Sessão: {session?.email}
            </p>
          )}
          {data && (
            <p className="mt-2 text-xs text-stone-500">
              {data.productRows ?? 0} produto(s) no catálogo · última alteração em
              produtos: {fmtWhen(data.catalogLastUpdatedAt)}
              {data.driveSettingsUpdatedAt
                ? ` · configuração Drive: ${fmtWhen(data.driveSettingsUpdatedAt)}`
                : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "A carregar…" : "Atualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <AdminPurpleStatCard
            label="Total geral de peças"
            value={data.grandTotal.pieces.toLocaleString("pt-BR")}
            sub={`${data.grandTotal.productCount.toLocaleString("pt-BR")} produto(s) (SKUs)`}
          />
          <AdminPurpleCard className="p-4">
            {chartEntries.length > 0 ? (
              <CategoryPieChart
                title="Peças por categoria"
                entries={chartEntries}
                theme="purple"
              />
            ) : (
              <p className="py-8 text-center text-sm text-violet-100/60">
                Sem dados para o gráfico.
              </p>
            )}
          </AdminPurpleCard>
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-stone-500">A carregar inventário…</p>
      )}

      {data && data.categories.length === 0 && !loading && (
        <p className="text-sm text-stone-500">
          Nenhum produto no catálogo. Importe a pasta do Drive em Configuração.
        </p>
      )}

      {data && data.categories.length > 0 && (
        <ul className="space-y-4">
          {data.categories.map((row) => (
            <CategoryCard
              key={row.category}
              row={row}
              open={expanded[row.category] ?? false}
              onToggle={() => toggleCategory(row.category)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryCard({
  row,
  open,
  onToggle,
}: {
  row: CategoryStockSummary;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <AdminPurpleCard className="overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/5"
        >
          <div>
            <p className="text-lg font-bold text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              {row.category}
            </p>
            <p className="text-sm text-violet-100/80">
              {row.pieces.toLocaleString("pt-BR")} peça(s) ·{" "}
              {row.productCount.toLocaleString("pt-BR")} produto(s)
            </p>
          </div>
          <span className="text-sm font-medium text-violet-100/90">
            {open ? "Ocultar tamanhos" : "Ver por tamanho"}
          </span>
        </button>
        {open && (
          <div className="border-t border-white/10 px-5 py-3">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-violet-200/70">
                  <th className="py-2 pr-4">Tamanho</th>
                  <th className="py-2 pr-4">Produtos</th>
                  <th className="py-2">Peças (Σ stock)</th>
                </tr>
              </thead>
              <tbody>
                {row.bySize.map((sz) => (
                  <tr key={sz.size} className="border-t border-white/10">
                    <td className="py-2.5 font-semibold text-white">{sz.size}</td>
                    <td className="py-2.5 text-violet-100/85">
                      {sz.productCount.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2.5 font-medium text-white">
                      {sz.pieces.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/15 font-semibold text-white">
                  <td className="py-2.5">Total</td>
                  <td className="py-2.5">{row.productCount.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5">{row.pieces.toLocaleString("pt-BR")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </AdminPurpleCard>
    </li>
  );
}
