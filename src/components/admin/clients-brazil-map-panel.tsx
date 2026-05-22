"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import brazilMap from "@svg-maps/brazil";
import { useAdminAuth } from "@/contexts/admin-auth";
import { ClientProfileBadge } from "@/components/client-profile-badge";
import type { BusinessProfile } from "@/lib/client-follow-up";
import {
  BRAZIL_UF_LABELS,
  type BrazilUf,
  ufFromSvgStateId,
} from "@/lib/brazil-ddd";
import type {
  StateClientBreakdown,
  TopSalesState,
} from "@/app/api/admin/clients/map/route";

type SellerFilterOption = { value: string; label: string };

const PROFILE_COLORS: Record<
  "lojista" | "revendedor" | "uso_proprio" | "sem_perfil",
  string
> = {
  lojista: "#ea580c",
  revendedor: "#c026d3",
  uso_proprio: "#0284c7",
  sem_perfil: "#a8a29e",
};

function money(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fillForCount(count: number, max: number): string {
  if (count <= 0) return "#f5f5f4";
  const t = Math.min(1, count / Math.max(1, max));
  const lightness = 92 - t * 38;
  return `hsl(262 52% ${lightness}%)`;
}

function breakdownByUf(
  states: StateClientBreakdown[]
): Map<BrazilUf, StateClientBreakdown> {
  return new Map(states.map((s) => [s.uf, s]));
}

export function ClientsBrazilMapPanel({ active }: { active: boolean }) {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<StateClientBreakdown[]>([]);
  const [topSales, setTopSales] = useState<TopSalesState[]>([]);
  const [maxClients, setMaxClients] = useState(1);
  const [clientsWithoutUf, setClientsWithoutUf] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [hoverUf, setHoverUf] = useState<BrazilUf | null>(null);
  const [sellerScope, setSellerScope] = useState("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<
    SellerFilterOption[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (isOwner && sellerScope && sellerScope !== "all") {
        q.set("sellerScope", sellerScope);
      }
      const qs = q.toString();
      const res = await adminFetch(
        `/api/admin/clients/map${qs ? `?${qs}` : ""}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar mapa");
      setStates((data.states ?? []) as StateClientBreakdown[]);
      setTopSales((data.topSalesStates ?? []) as TopSalesState[]);
      setMaxClients(Number(data.maxClients ?? 1));
      setClientsWithoutUf(Number(data.clientsWithoutUf ?? 0));
      setTotalClients(Number(data.totalClients ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setStates([]);
      setTopSales([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, isOwner, sellerScope]);

  useEffect(() => {
    if (!isOwner) {
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
  }, [adminFetch, isOwner]);

  useEffect(() => {
    if (active) void load();
  }, [load, active]);

  const byUf = useMemo(() => breakdownByUf(states), [states]);
  const hoverRow = hoverUf ? byUf.get(hoverUf) : null;

  const totals = useMemo(() => {
    let lojista = 0;
    let revendedor = 0;
    let uso_proprio = 0;
    let sem_perfil = 0;
    for (const s of states) {
      lojista += s.lojista;
      revendedor += s.revendedor;
      uso_proprio += s.uso_proprio;
      sem_perfil += s.sem_perfil;
    }
    return { lojista, revendedor, uso_proprio, sem_perfil };
  }, [states]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600">
        Distribuição por estado inferida pelo DDD do WhatsApp. Passe o rato sobre
        um estado para ver o detalhe por perfil.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        {isOwner && sellerFilterOptions.length > 0 && (
          <div className="flex min-w-[12rem] flex-col gap-1">
            <label
              htmlFor="mapa-seller-filter"
              className="text-xs font-medium text-stone-600"
            >
              Vendedor
            </label>
            <select
              id="mapa-seller-filter"
              value={sellerScope}
              onChange={(e) => setSellerScope(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
            >
              {sellerFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          {loading ? "A carregar…" : "Atualizar"}
        </button>
      </div>

      {topSales.length > 0 && (
        <p className="text-xs text-stone-400">
          <span className="text-stone-500">Vendas (30 dias): </span>
          {topSales.map((t, i) => (
            <span key={t.uf}>
              {i > 0 ? " · " : null}
              <span className="text-stone-500">
                {i + 1}º {t.uf}
              </span>{" "}
              {money(t.revenue)}
            </span>
          ))}
        </p>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="relative rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white p-4 shadow-sm sm:p-6">
        <svg
          viewBox={brazilMap.viewBox}
          className="mx-auto h-auto w-full max-w-2xl touch-manipulation"
          role="img"
          aria-label="Mapa do Brasil com quantidade de clientes por estado"
        >
          <title>Clientes por estado (DDD)</title>
          {brazilMap.locations.map((loc: { id: string; path: string }) => {
            const uf = ufFromSvgStateId(loc.id);
            if (!uf) return null;
            const row = byUf.get(uf);
            const count = row?.total ?? 0;
            const isHover = hoverUf === uf;
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={fillForCount(count, maxClients)}
                stroke={isHover ? "#5b21b6" : "#e7e5e4"}
                strokeWidth={isHover ? 1.5 : 0.6}
                className="cursor-pointer transition-[fill,stroke] duration-150"
                onMouseEnter={() => setHoverUf(uf)}
                onMouseLeave={() => setHoverUf(null)}
                onFocus={() => setHoverUf(uf)}
                onBlur={() => setHoverUf(null)}
                tabIndex={0}
                aria-label={`${BRAZIL_UF_LABELS[uf]}: ${count} cliente(s)`}
              />
            );
          })}
        </svg>

        {hoverRow && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 max-w-sm rounded-xl border border-violet-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:left-6">
            <p className="text-sm font-semibold text-stone-900">
              {hoverRow.name} ({hoverRow.uf})
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              {hoverRow.total} cliente{hoverRow.total === 1 ? "" : "s"} no total
            </p>
            <ul className="mt-2 space-y-1 text-xs text-stone-700">
              <li className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PROFILE_COLORS.lojista }}
                />
                Lojista: {hoverRow.lojista}
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PROFILE_COLORS.revendedor }}
                />
                Revendedor: {hoverRow.revendedor}
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PROFILE_COLORS.uso_proprio }}
                />
                Uso próprio: {hoverRow.uso_proprio}
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PROFILE_COLORS.sem_perfil }}
                />
                Sem perfil: {hoverRow.sem_perfil}
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-8 rounded"
            style={{
              background:
                "linear-gradient(to right, #f5f5f4, hsl(262 52% 54%))",
            }}
          />
          Mais clientes → cor mais intensa
        </span>
        {(
          [
            ["lojista", "Lojista"],
            ["revendedor", "Revendedor"],
            ["uso_proprio", "Uso próprio"],
            ["sem_perfil", "Sem perfil"],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: PROFILE_COLORS[key] }}
            />
            {label}: {totals[key]}
          </span>
        ))}
      </div>

      <p className="text-xs text-stone-500">
        {totalClients} cliente(s) mapeado(s).
        {clientsWithoutUf > 0
          ? ` ${clientsWithoutUf} com DDD não identificado (excluídos do mapa).`
          : null}
      </p>

      <div className="flex flex-wrap gap-2">
        {(["lojista", "revendedor", "uso_proprio"] as BusinessProfile[]).map(
          (p) => (
            <ClientProfileBadge key={p} profile={p} />
          )
        )}
      </div>
    </div>
  );
}
