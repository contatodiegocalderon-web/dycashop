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
type ProfileFilter = "all" | "lojista" | "uso_proprio" | "revendedor";

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

export function ClientsBrazilMapPanel({ active }: { active: boolean }) {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<StateClientBreakdown[]>([]);
  const [topSales, setTopSales] = useState<TopSalesState[]>([]);
  const [clientsWithoutUf, setClientsWithoutUf] = useState(0);
  const [hoverUf, setHoverUf] = useState<BrazilUf | null>(null);
  const [selectedUf, setSelectedUf] = useState<BrazilUf | null>(null);
  const [sellerScope, setSellerScope] = useState("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
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

  const filteredStates = useMemo(() => {
    if (profileFilter === "all") return states;

    return states.map((state) => {
      const clients = state.clients.filter(
        (client) => client.business_profile === profileFilter
      );
      const counts = countProfiles(clients);
      return {
        ...state,
        total: clients.length,
        clients,
        lojista: counts.lojista,
        revendedor: counts.revendedor,
        uso_proprio: counts.uso_proprio,
        sem_perfil: counts.sem_perfil,
        desconhecido: 0,
      };
    });
  }, [states, profileFilter]);

  const visibleMaxClients = useMemo(
    () => Math.max(1, ...filteredStates.map((s) => s.total)),
    [filteredStates]
  );
  const visibleTotalClients = useMemo(
    () => filteredStates.reduce((sum, state) => sum + state.total, 0),
    [filteredStates]
  );
  const byUf = useMemo(() => breakdownByUf(filteredStates), [filteredStates]);
  const hoverRow = hoverUf ? byUf.get(hoverUf) : null;
  const selectedRow = selectedUf ? byUf.get(selectedUf) : null;

  const totals = useMemo(() => {
    let lojista = 0;
    let revendedor = 0;
    let uso_proprio = 0;
    let sem_perfil = 0;
    for (const s of filteredStates) {
      lojista += s.lojista;
      revendedor += s.revendedor;
      uso_proprio += s.uso_proprio;
      sem_perfil += s.sem_perfil;
    }
    return { lojista, revendedor, uso_proprio, sem_perfil };
  }, [filteredStates]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600">
        Distribuição por estado inferida pelo DDD do WhatsApp. Clique em um
        estado para ver a lista de clientes e chamar no WhatsApp.
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
        <div className="flex min-w-[12rem] flex-col gap-1">
          <label
            htmlFor="mapa-profile-filter"
            className="text-xs font-medium text-stone-600"
          >
            Perfil
          </label>
          <select
            id="mapa-profile-filter"
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value as ProfileFilter)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Todos</option>
            <option value="lojista">Lojista</option>
            <option value="uso_proprio">Uso próprio</option>
            <option value="revendedor">Revendedor</option>
          </select>
        </div>
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
                onClick={() => setSelectedUf(uf)}
                onMouseEnter={() => setHoverUf(uf)}
                onMouseLeave={() => setHoverUf(null)}
                onFocus={() => setHoverUf(uf)}
                onBlur={() => setHoverUf(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedUf(uf);
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

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        {selectedRow ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-stone-900">
                  Clientes em {selectedRow.name} ({selectedRow.uf})
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  {selectedRow.total} cliente
                  {selectedRow.total === 1 ? "" : "s"} identificado
                  {selectedRow.total === 1 ? "" : "s"} pelo DDD.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUf(null)}
                className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Limpar seleção
              </button>
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
          </>
        ) : (
          <p className="text-sm text-stone-500">
            Clique em um estado do mapa para ver os clientes aqui embaixo.
          </p>
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
        {visibleTotalClients} cliente(s) mapeado(s)
        {profileFilter !== "all" ? " neste perfil" : ""}.
        {profileFilter === "all" && clientsWithoutUf > 0
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
