"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import brazilMap from "@svg-maps/brazil";
import { useAdminAuth } from "@/contexts/admin-auth";
import { ClientProfileBadge } from "@/components/client-profile-badge";
import { ClientRecencyBadge } from "@/components/client-recency-badge";
import {
  BRAZIL_UF_LABELS,
  type BrazilUf,
  ufFromSvgStateId,
} from "@/lib/brazil-ddd";
import type {
  StateClientBreakdown,
  TopSalesState,
} from "@/app/api/admin/clients/map/route";
import type { ClientRecencyStatus } from "@/lib/client-recency";

type SellerFilterOption = { value: string; label: string };
type RecencyFilter = "all" | ClientRecencyStatus;
type ProfileFilter =
  | "all"
  | "lojista"
  | "uso_proprio"
  | "revendedor"
  | "sem_perfil";

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

function waDisplay(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 11) return d;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

function waLink(digits: string) {
  return `https://wa.me/${digits.replace(/\D/g, "")}`;
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
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

function countProfiles(clients: StateClientBreakdown["clients"]) {
  let lojista = 0;
  let revendedor = 0;
  let uso_proprio = 0;
  let sem_perfil = 0;
  for (const client of clients) {
    if (client.business_profile === "lojista") lojista += 1;
    else if (client.business_profile === "revendedor") revendedor += 1;
    else if (client.business_profile === "uso_proprio") uso_proprio += 1;
    else sem_perfil += 1;
  }
  return { lojista, revendedor, uso_proprio, sem_perfil };
}

function filterStateClients(
  clients: StateClientBreakdown["clients"],
  profileFilter: ProfileFilter,
  recencyFilter: RecencyFilter
) {
  return clients.filter((client) => {
    if (profileFilter !== "all") {
      if (profileFilter === "sem_perfil") {
        if (client.business_profile) return false;
      } else if (client.business_profile !== profileFilter) {
        return false;
      }
    }
    if (recencyFilter !== "all" && client.recency_status !== recencyFilter) {
      return false;
    }
    return true;
  });
}

function applyStateClientFilters(
  row: StateClientBreakdown,
  profileFilter: ProfileFilter,
  recencyFilter: RecencyFilter
): StateClientBreakdown {
  if (profileFilter === "all" && recencyFilter === "all") return row;

  const clients = filterStateClients(row.clients, profileFilter, recencyFilter);
  const counts = countProfiles(clients);
  return {
    ...row,
    total: clients.length,
    clients,
    lojista: counts.lojista,
    revendedor: counts.revendedor,
    uso_proprio: counts.uso_proprio,
    sem_perfil: counts.sem_perfil,
    desconhecido: 0,
  };
}

export function ClientsBrazilMapPanel({ active }: { active: boolean }) {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<StateClientBreakdown[]>([]);
  const [topSales, setTopSales] = useState<TopSalesState[]>([]);
  const [clientsWithoutUf, setClientsWithoutUf] = useState(0);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [hoverUf, setHoverUf] = useState<BrazilUf | null>(null);
  const [selectedUf, setSelectedUf] = useState<BrazilUf | null>(null);
  const [sellerScope, setSellerScope] = useState("all");
  const [stateProfileFilter, setStateProfileFilter] =
    useState<ProfileFilter>("all");
  const [stateRecencyFilter, setStateRecencyFilter] =
    useState<RecencyFilter>("all");
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
      setClientsWithoutUf(Number(data.clientsWithoutUf ?? 0));
      setTotalRegistered(Number(data.totalClients ?? 0));
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

  const visibleMaxClients = useMemo(
    () => Math.max(1, ...states.map((s) => s.total)),
    [states]
  );
  const visibleTotalClients = useMemo(
    () => states.reduce((sum, state) => sum + state.total, 0),
    [states]
  );
  const byUf = useMemo(() => breakdownByUf(states), [states]);
  const hoverRow = hoverUf ? byUf.get(hoverUf) : null;

  const selectedRow = useMemo(() => {
    if (!selectedUf) return null;
    const row = byUf.get(selectedUf);
    if (!row) return null;
    return applyStateClientFilters(row, stateProfileFilter, stateRecencyFilter);
  }, [selectedUf, byUf, stateProfileFilter, stateRecencyFilter]);

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

  const statesByClientCount = useMemo(
    () =>
      states
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR")),
    [states]
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600">
        Distribuição por estado inferida pelo DDD do WhatsApp. Clique em um
        estado para ver a lista de clientes (semáforo da última compra) e chamar
        no WhatsApp.
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
            const isSelected = selectedUf === uf;
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={fillForCount(count, visibleMaxClients)}
                stroke={isSelected || isHover ? "#5b21b6" : "#e7e5e4"}
                strokeWidth={isSelected || isHover ? 1.7 : 0.6}
                className="cursor-pointer transition-[fill,stroke] duration-150"
                onClick={() => {
                  setSelectedUf(uf);
                  setStateProfileFilter("all");
                  setStateRecencyFilter("all");
                }}
                onMouseEnter={() => setHoverUf(uf)}
                onMouseLeave={() => setHoverUf(null)}
                onFocus={() => setHoverUf(uf)}
                onBlur={() => setHoverUf(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedUf(uf);
                    setStateProfileFilter("all");
                    setStateRecencyFilter("all");
                  }
                }}
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

      {selectedRow ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-stone-900">
                Clientes em {selectedRow.name} ({selectedRow.uf})
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                {selectedRow.total} cliente
                {selectedRow.total === 1 ? "" : "s"} · {selectedRow.lojista}{" "}
                lojista
                {selectedRow.lojista === 1 ? "" : "s"} · {selectedRow.revendedor}{" "}
                revendedor
                {selectedRow.revendedor === 1 ? "" : "es"} · {selectedRow.uso_proprio}{" "}
                uso próprio
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-[10rem] flex-col gap-1">
                <label
                  htmlFor="mapa-state-recency-filter"
                  className="text-xs font-medium text-stone-600"
                >
                  Última compra
                </label>
                <select
                  id="mapa-state-recency-filter"
                  value={stateRecencyFilter}
                  onChange={(e) =>
                    setStateRecencyFilter(e.target.value as RecencyFilter)
                  }
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                >
                  <option value="all">Todas</option>
                  <option value="green">Verde — menos de 30 dias</option>
                  <option value="yellow">Amarelo — 30 a 59 dias</option>
                  <option value="red">Vermelho — 60 dias ou mais</option>
                </select>
              </div>
              <div className="flex min-w-[10rem] flex-col gap-1">
                <label
                  htmlFor="mapa-state-profile-filter"
                  className="text-xs font-medium text-stone-600"
                >
                  Perfil
                </label>
                <select
                  id="mapa-state-profile-filter"
                  value={stateProfileFilter}
                  onChange={(e) =>
                    setStateProfileFilter(e.target.value as ProfileFilter)
                  }
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                >
                  <option value="all">Todos</option>
                  <option value="lojista">Lojista</option>
                  <option value="uso_proprio">Uso próprio</option>
                  <option value="revendedor">Revendedor</option>
                  <option value="sem_perfil">Sem perfil</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUf(null);
                  setStateProfileFilter("all");
                  setStateRecencyFilter("all");
                }}
                className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Limpar seleção
              </button>
            </div>
          </div>

          {selectedRow.clients.length > 0 ? (
            <ul className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-100">
              {selectedRow.clients.map((client) => (
                <li
                  key={client.customer_whatsapp}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-900">
                        {client.customer_name?.trim() || "Cliente sem nome"}
                      </p>
                      <ClientRecencyBadge status={client.recency_status} />
                      {client.business_profile ? (
                        <ClientProfileBadge profile={client.business_profile} />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-stone-500">
                      {waDisplay(client.customer_whatsapp)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {client.order_count} pedido
                      {client.order_count === 1 ? "" : "s"} ·{" "}
                      {money(client.total_spent)} · último pedido em{" "}
                      {shortDate(client.last_confirmed_at)}
                    </p>
                  </div>
                  <a
                    href={waLink(client.customer_whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#20bd5a]"
                  >
                    Chamar no WhatsApp
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
              Nenhum cliente encontrado neste estado para o filtro atual.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          Última compra:
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Verde (&lt; 30 dias)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Amarelo (30–59 dias)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Vermelho (60+ dias)
        </span>
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
        {visibleTotalClients} cliente(s) no mapa
        {totalRegistered > 0
          ? ` · ${totalRegistered} registrado(s) com pedido pago`
          : ""}
        . Só entram quem comprou (Registrados); carrinhos abandonados não aparecem aqui.
        {clientsWithoutUf > 0
          ? ` ${clientsWithoutUf} registrado(s) com DDD não identificado (fora do mapa).`
          : null}
      </p>

      {statesByClientCount.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <p className="border-b border-stone-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Clientes por estado (maior → menor)
          </p>
          <ul className="divide-y divide-stone-100">
            {statesByClientCount.map((state) => (
              <li key={state.uf}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUf(state.uf);
                    setStateProfileFilter("all");
                    setStateRecencyFilter("all");
                  }}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm transition hover:bg-violet-50/80 ${
                    selectedUf === state.uf ? "bg-violet-50/60" : ""
                  }`}
                >
                  <span className="font-semibold text-stone-900">
                    {state.name}{" "}
                    <span className="font-normal text-stone-500">({state.uf})</span>
                  </span>
                  <span className="text-xs text-stone-600">
                    <span className="font-medium text-stone-800">
                      {state.total}
                    </span>{" "}
                    cliente{state.total === 1 ? "" : "s"} ·{" "}
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ color: PROFILE_COLORS.lojista }}
                    >
                      {state.lojista} lojista{state.lojista === 1 ? "" : "s"}
                    </span>
                    {" · "}
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ color: PROFILE_COLORS.revendedor }}
                    >
                      {state.revendedor} revendedor
                      {state.revendedor === 1 ? "" : "es"}
                    </span>
                    {" · "}
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ color: PROFILE_COLORS.uso_proprio }}
                    >
                      {state.uso_proprio} uso próprio
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
