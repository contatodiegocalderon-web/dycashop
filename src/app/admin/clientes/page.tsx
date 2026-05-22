"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AbandonedCartsPanel } from "@/components/admin/abandoned-carts-panel";
import { ClientsBrazilMapPanel } from "@/components/admin/clients-brazil-map-panel";
import { useAdminAuth } from "@/contexts/admin-auth";
import { ClientProfileBadge } from "@/components/client-profile-badge";
import { ClientRecencyBadge } from "@/components/client-recency-badge";
import type { BusinessProfile } from "@/lib/client-follow-up";
import type { ClientRecencyStatus } from "@/lib/client-recency";

type ClientesTab = "registados" | "abandonados" | "mapa";

type ClientRow = {
  customer_whatsapp: string;
  customer_name: string | null;
  customer_segment: string | null;
  is_new: boolean;
  order_count: number;
  total_spent: number;
  first_confirmed_at: string | null;
  last_confirmed_at: string | null;
  sellers_label: string;
  business_profile: BusinessProfile | null;
  recency_status: ClientRecencyStatus;
};

type SellerFilterOption = { value: string; label: string };

type RecencyFilter = "all" | ClientRecencyStatus;
type ProfileFilter =
  | "all"
  | "lojista"
  | "revendedor"
  | "uso_proprio"
  | "sem_perfil";

function money(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
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

function clientsToCsv(rows: ClientRow[]): string {
  const header = [
    "nome",
    "whatsapp",
    "vendedor",
    "perfil",
    "semaforo",
    "pedidos",
    "total_gasto",
    "ultimo_pedido",
  ];
  const lines = [header.join(",")];
  for (const c of rows) {
    const last = c.last_confirmed_at
      ? new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")
      : "";
    const name = (c.customer_name ?? "").replaceAll('"', '""');
    const sellers = (c.sellers_label ?? "").replaceAll('"', '""');
    lines.push(
      [
        `"${name}"`,
        c.customer_whatsapp,
        `"${sellers}"`,
        c.business_profile ?? "",
        c.recency_status,
        String(c.order_count),
        String(c.total_spent).replace(".", ","),
        last,
      ].join(",")
    );
  }
  return "\uFEFF" + lines.join("\n");
}

function downloadBlob(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminClientesPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const initialTab: ClientesTab =
    tabFromUrl === "abandonados"
      ? "abandonados"
      : tabFromUrl === "mapa"
        ? "mapa"
        : "registados";

  const { adminFetch, isOwner } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<ClientesTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [removingWa, setRemovingWa] = useState<string | null>(null);
  const [classifyingWa, setClassifyingWa] = useState<string | null>(null);
  const [sellerScope, setSellerScope] = useState<string>("all");
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<SellerFilterOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (isOwner && sellerScope && sellerScope !== "all") {
        q.set("sellerScope", sellerScope);
      }
      if (recencyFilter !== "all") q.set("recency", recencyFilter);
      if (profileFilter !== "all") q.set("profile", profileFilter);
      const qs = q.toString();
      const res = await adminFetch(`/api/admin/clients${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar");
      setClients((data.clients ?? []) as ClientRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, isOwner, sellerScope, recencyFilter, profileFilter]);

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
    setActiveTab(
      tabFromUrl === "abandonados"
        ? "abandonados"
        : tabFromUrl === "mapa"
          ? "mapa"
          : "registados"
    );
  }, [tabFromUrl]);

  useEffect(() => {
    if (activeTab === "registados") void load();
  }, [load, activeTab]);

  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const row of clients) {
      if (row.recency_status === "green") c.green += 1;
      if (row.recency_status === "yellow") c.yellow += 1;
      if (row.recency_status === "red") c.red += 1;
    }
    return c;
  }, [clients]);

  async function setBusinessProfile(
    customerWhatsapp: string,
    business_profile: BusinessProfile
  ) {
    setClassifyingWa(customerWhatsapp);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/clients/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_whatsapp: customerWhatsapp,
          business_profile,
        }),
      });
      const data = (await res.json()) as { error?: string; hint?: string };
      if (!res.ok) {
        throw new Error(
          [data.error, data.hint].filter(Boolean).join(" — ") || "Falha ao guardar"
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setClassifyingWa(null);
    }
  }

  async function removeContact(customerWhatsapp: string) {
    const firstConfirm = window.confirm(
      "Remover este contacto da lista de clientes? Os pedidos confirmados mantêm-se no sistema."
    );
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(
      `Confirma novamente a remoção do contacto ${waDisplay(customerWhatsapp)}?`
    );
    if (!secondConfirm) return;
    setRemovingWa(customerWhatsapp);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_whatsapp: customerWhatsapp }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setRemovingWa(null);
    }
  }

  function exportCsv() {
    if (!clients.length) return;
    downloadBlob(
      `clientes-dycashop-${new Date().toISOString().slice(0, 10)}.csv`,
      clientsToCsv(clients),
      "text/csv;charset=utf-8"
    );
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImportMsg(null);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        setImportMsg("Ficheiro vazio ou inválido.");
        return;
      }
      setImportMsg(
        `Lidas ${lines.length - 1} linha(s). Importação em massa ainda não está ativa — use exportar para backup.`
      );
    };
    reader.readAsText(f, "UTF-8");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
          Clientes
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Registados: quem já teve pelo menos um pedido confirmado (pago). Carrinhos
          abandonados: pedidos pendentes ou cancelados de quem ainda não comprou — para
          remarketing até a primeira confirmação.
        </p>
        <Link
          href="/admin/metricas"
          className="mt-4 inline-block text-sm font-medium text-violet-800 underline hover:text-violet-900"
        >
          ← Métricas
        </Link>
      </div>

      <div
        className="mb-8 flex gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="Secções de clientes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "registados"}
          onClick={() => setActiveTab("registados")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "registados"
              ? "bg-stone-900 text-white shadow"
              : "text-stone-600 hover:bg-stone-50"
          }`}
        >
          Registados
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "abandonados"}
          onClick={() => setActiveTab("abandonados")}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "abandonados"
              ? "bg-stone-900 text-white shadow"
              : "text-stone-600 hover:bg-stone-50"
          }`}
        >
          Carrinhos abandonados
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "mapa"}
          onClick={() => setActiveTab("mapa")}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "mapa"
              ? "bg-stone-900 text-white shadow"
              : "text-stone-600 hover:bg-stone-50"
          }`}
        >
          Mapa
        </button>
      </div>

      {activeTab === "abandonados" ? (
        <AbandonedCartsPanel active />
      ) : activeTab === "mapa" ? (
        <ClientsBrazilMapPanel active />
      ) : (
        <>
      <div className="mb-6 flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-900">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Este mês: {counts.green}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-950">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          1 mês: {counts.yellow}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-900">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          2+ meses: {counts.red}
        </span>
      </div>

      <div className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        {isOwner && sellerFilterOptions.length > 0 && (
          <div className="flex w-full min-w-[12rem] flex-col gap-1 sm:w-auto">
            <label htmlFor="clientes-seller-filter" className="text-xs font-medium text-stone-600">
              Vendedor
            </label>
            <select
              id="clientes-seller-filter"
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
        <div className="flex w-full min-w-[12rem] flex-col gap-1 sm:w-auto">
          <label htmlFor="clientes-recency-filter" className="text-xs font-medium text-stone-600">
            Semáforo
          </label>
          <select
            id="clientes-recency-filter"
            value={recencyFilter}
            onChange={(e) => setRecencyFilter(e.target.value as RecencyFilter)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Todos</option>
            <option value="green">Verde — este mês</option>
            <option value="yellow">Amarelo — 1 mês</option>
            <option value="red">Vermelho — 2+ meses</option>
          </select>
        </div>
        <div className="flex w-full min-w-[12rem] flex-col gap-1 sm:w-auto">
          <label htmlFor="clientes-profile-filter" className="text-xs font-medium text-stone-600">
            Perfil
          </label>
          <select
            id="clientes-profile-filter"
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value as ProfileFilter)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Todos</option>
            <option value="lojista">Lojista</option>
            <option value="revendedor">Revendedor</option>
            <option value="uso_proprio">Uso próprio</option>
            <option value="sem_perfil">Sem perfil</option>
          </select>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || clients.length === 0}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-stone-800 disabled:opacity-40"
        >
          Exportar CSV
        </button>
        <label className="cursor-pointer rounded-xl border border-stone-300 bg-stone-50 px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-100">
          Importar CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          {loading ? "A carregar…" : "Atualizar"}
        </button>
      </div>

      {importMsg && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {importMsg}
        </p>
      )}

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {activeTab === "registados" && !loading && clients.length === 0 && !error && (
        <p className="text-sm text-stone-500">
          Nenhum cliente neste filtro — confirme pedidos com WhatsApp ou altere o filtro.
        </p>
      )}

      {clients.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg shadow-stone-900/5">
          {clients.map((c) => {
            const busy = classifyingWa === c.customer_whatsapp;
            return (
              <li
                key={c.customer_whatsapp}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50/80"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-900">{c.customer_name ?? "—"}</p>
                    <ClientRecencyBadge status={c.recency_status} />
                    {c.business_profile ? (
                      <ClientProfileBadge profile={c.business_profile} />
                    ) : null}
                  </div>
                  <p className="text-sm text-stone-500">{waDisplay(c.customer_whatsapp)}</p>
                  <p className="mt-1 text-sm text-stone-700">
                    <span className="text-stone-500">Vendedor: </span>
                    {c.sellers_label ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {c.is_new ? "Novo" : "Antigo"} · {c.order_count} pedido(s) · Total{" "}
                    {money(c.total_spent)}
                    {c.last_confirmed_at && (
                      <>
                        {" "}
                        · Último{" "}
                        {new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  {!c.business_profile && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void setBusinessProfile(c.customer_whatsapp, "lojista")
                        }
                        className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-950 hover:bg-orange-100 disabled:opacity-50"
                      >
                        {busy ? "…" : "Lojista"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void setBusinessProfile(c.customer_whatsapp, "revendedor")
                        }
                        className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-semibold text-fuchsia-900 hover:bg-fuchsia-100 disabled:opacity-50"
                      >
                        {busy ? "…" : "Revendedor"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void setBusinessProfile(
                            c.customer_whatsapp,
                            "uso_proprio"
                          )
                        }
                        className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                      >
                        {busy ? "…" : "Uso próprio"}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void removeContact(c.customer_whatsapp)}
                      disabled={removingWa === c.customer_whatsapp}
                      className="inline-flex items-center rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {removingWa === c.customer_whatsapp ? "A remover…" : "Remover"}
                    </button>
                    <a
                      href={waLink(c.customer_whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#20bd5a]"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
