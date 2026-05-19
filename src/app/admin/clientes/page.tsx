"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import {
  followUpWhatsAppMessage,
  type BusinessProfile,
} from "@/lib/client-follow-up";

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
  needs_follow_up: boolean;
  follow_up_due_at: string | null;
  follow_up_completed_at: string | null;
  follow_up_staff_id: string | null;
  business_profile: BusinessProfile | null;
};

type SellerFilterOption = { value: string; label: string };

type ProfileFilter =
  | "all"
  | "follow_up"
  | "lojista"
  | "revendedor"
  | "sem_perfil";

const PROFILE_LABEL: Record<BusinessProfile, string> = {
  lojista: "Lojista",
  revendedor: "Revendedor",
};

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

function waLink(digits: string, text?: string) {
  const d = digits.replace(/\D/g, "");
  const base = `https://wa.me/${d}`;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

function clientsToCsv(rows: ClientRow[]): string {
  const header = [
    "nome",
    "whatsapp",
    "vendedor",
    "segmento",
    "perfil_negocio",
    "pedidos",
    "total_gasto",
    "primeiro_pedido",
    "ultimo_pedido",
  ];
  const lines = [header.join(",")];
  for (const c of rows) {
    const first = c.first_confirmed_at
      ? new Date(c.first_confirmed_at).toLocaleDateString("pt-BR")
      : "";
    const last = c.last_confirmed_at
      ? new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")
      : "";
    const seg =
      c.customer_segment === "NOVO"
        ? "NOVO"
        : c.customer_segment === "ANTIGO"
          ? "ANTIGO"
          : "";
    const name = (c.customer_name ?? "").replaceAll('"', '""');
    const sellers = (c.sellers_label ?? "").replaceAll('"', '""');
    const perfil = c.business_profile ?? "";
    lines.push(
      [
        `"${name}"`,
        c.customer_whatsapp,
        `"${sellers}"`,
        seg,
        perfil,
        String(c.order_count),
        String(c.total_spent).replace(".", ","),
        first,
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

function profileBadge(c: ClientRow) {
  if (c.business_profile) {
    return (
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
        {PROFILE_LABEL[c.business_profile]}
      </span>
    );
  }
  if (c.needs_follow_up) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        Follow-up
      </span>
    );
  }
  return null;
}

export default function AdminClientesPage() {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [followUpQueue, setFollowUpQueue] = useState<ClientRow[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [removingWa, setRemovingWa] = useState<string | null>(null);
  const [classifyingWa, setClassifyingWa] = useState<string | null>(null);
  const [sellerScope, setSellerScope] = useState<string>("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<SellerFilterOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q =
        isOwner && sellerScope && sellerScope !== "all"
          ? `?sellerScope=${encodeURIComponent(sellerScope)}`
          : "";
      const res = await adminFetch(`/api/admin/clients${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar");
      setClients((data.clients ?? []) as ClientRow[]);
      setFollowUpQueue((data.follow_up_queue ?? []) as ClientRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setClients([]);
      setFollowUpQueue([]);
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
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = [...clients];
    switch (profileFilter) {
      case "follow_up":
        rows =
          followUpQueue.length > 0
            ? [...followUpQueue]
            : rows.filter((c) => c.needs_follow_up);
        break;
      case "lojista":
        rows = rows.filter((c) => c.business_profile === "lojista");
        break;
      case "revendedor":
        rows = rows.filter((c) => c.business_profile === "revendedor");
        break;
      case "sem_perfil":
        rows = rows.filter((c) => !c.business_profile);
        break;
      default:
        break;
    }
    return rows.sort((a, b) => {
      const ta = a.last_confirmed_at ?? "";
      const tb = b.last_confirmed_at ?? "";
      const byDate = tb.localeCompare(ta);
      if (byDate !== 0) return byDate;
      return (a.customer_name ?? "").localeCompare(b.customer_name ?? "", "pt-BR");
    });
  }, [clients, profileFilter, followUpQueue]);

  /** Evita duplicar contactos que já estão na caixa de follow-up. */
  const mainList = useMemo(() => {
    if (profileFilter === "follow_up") return [];
    if (profileFilter === "all" && followUpQueue.length > 0) {
      return filtered.filter((c) => !c.needs_follow_up);
    }
    return filtered;
  }, [filtered, profileFilter, followUpQueue.length]);

  function followUpRowKey(c: ClientRow) {
    return `${c.customer_whatsapp}:${c.follow_up_staff_id ?? ""}`;
  }

  async function completeFollowUp(
    customerWhatsapp: string,
    business_profile: BusinessProfile,
    follow_up_staff_id?: string | null
  ) {
    const rowKey = `${customerWhatsapp}:${follow_up_staff_id ?? ""}`;
    setClassifyingWa(rowKey);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/clients/follow-up", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_whatsapp: customerWhatsapp,
          business_profile,
          ...(follow_up_staff_id ? { follow_up_staff_id } : {}),
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
      "Remover este contacto da lista de clientes? Os pedidos confirmados e as métricas mantêm-se no sistema — apenas deixa de aparecer aqui."
    );
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(
      `Confirma novamente a remoção do contacto ${waDisplay(customerWhatsapp)} da lista?`
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
    if (!filtered.length) return;
    downloadBlob(
      `clientes-dycashop-${new Date().toISOString().slice(0, 10)}.csv`,
      clientsToCsv(filtered),
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
        `Lidas ${lines.length - 1} linha(s) de dados. A gravação em massa na base ainda não está ativa — use a exportação para backup e contactos.`
      );
    };
    reader.readAsText(f, "UTF-8");
  }

  function renderClientActions(c: ClientRow, showClassify: boolean) {
    const msg = followUpWhatsAppMessage(c.customer_name);
    const busy = classifyingWa === followUpRowKey(c);

    return (
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        {showClassify && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void completeFollowUp(
                  c.customer_whatsapp,
                  "lojista",
                  c.follow_up_staff_id
                )
              }
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            >
              {busy ? "…" : "Lojista"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void completeFollowUp(
                  c.customer_whatsapp,
                  "revendedor",
                  c.follow_up_staff_id
                )
              }
              className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-semibold text-fuchsia-900 hover:bg-fuchsia-100 disabled:opacity-50"
            >
              {busy ? "…" : "Revendedor"}
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
            href={waLink(c.customer_whatsapp, showClassify ? msg : undefined)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#20bd5a]"
          >
            WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
          Clientes registados
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Cada vendedor vê na fila de follow-up apenas os seus clientes cuja última compra foi há
          mais de 5 dias úteis. Após classificar (lojista ou revendedor), o contacto volta à lista
          normal para ofertas de recompra. Se comprar de novo, após 5 dias úteis o ciclo repete.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/metricas"
            className="text-sm font-medium text-violet-800 underline hover:text-violet-900"
          >
            ← Métricas
          </Link>
          <Link
            href="/admin/pedidos"
            className="text-sm font-medium text-violet-800 underline hover:text-violet-900"
          >
            Pedidos pendentes
          </Link>
        </div>
      </div>

      {!loading && followUpQueue.length > 0 && (
        <section className="mb-8 overflow-hidden rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/80 shadow-md">
          <div className="border-b border-amber-200/80 bg-amber-100/60 px-5 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-950">
              Follow-up — {followUpQueue.length} contacto
              {followUpQueue.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-0.5 text-xs text-amber-900/80">
              Última compra há 5+ dias úteis. Ligue no WhatsApp e classifique o perfil.
            </p>
          </div>
          <ul className="divide-y divide-amber-200/60">
            {followUpQueue.map((c) => (
              <li
                key={`fu-${followUpRowKey(c)}`}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-900">
                      {c.customer_name ?? "—"}
                    </p>
                    {profileBadge(c)}
                  </div>
                  <p className="text-sm text-stone-600">{waDisplay(c.customer_whatsapp)}</p>
                  {isOwner && c.sellers_label && (
                    <p className="mt-0.5 text-xs font-medium text-amber-950/80">
                      Vendedor: {c.sellers_label}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-amber-900/70">
                    Última compra{" "}
                    {c.last_confirmed_at
                      ? new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")
                      : "—"}
                    {c.follow_up_due_at && (
                      <>
                        {" "}
                        · Lembrete desde{" "}
                        {new Date(c.follow_up_due_at).toLocaleDateString("pt-BR")}
                      </>
                    )}
                  </p>
                </div>
                {renderClientActions(c, true)}
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <label htmlFor="clientes-profile-filter" className="text-xs font-medium text-stone-600">
            Perfil (ofertas)
          </label>
          <select
            id="clientes-profile-filter"
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value as ProfileFilter)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Todos</option>
            <option value="follow_up">Aguardam follow-up</option>
            <option value="lojista">Lojista</option>
            <option value="revendedor">Revendedor</option>
            <option value="sem_perfil">Sem perfil</option>
          </select>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || filtered.length === 0}
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

      {!loading &&
        mainList.length === 0 &&
        followUpQueue.length === 0 &&
        !error && (
        <p className="text-sm text-stone-500">
          Nenhum cliente neste filtro — confirme pedidos com WhatsApp ou altere o filtro.
        </p>
      )}

      {mainList.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg shadow-stone-900/5">
          {mainList.map((c) => (
            <li
              key={c.customer_whatsapp}
              className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50/80 ${
                c.needs_follow_up ? "bg-amber-50/40" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-stone-900">{c.customer_name ?? "—"}</p>
                  {profileBadge(c)}
                </div>
                <p className="text-sm text-stone-500">{waDisplay(c.customer_whatsapp)}</p>
                <p className="mt-1 text-sm text-stone-700">
                  <span className="text-stone-500">Vendedor: </span>
                  {c.sellers_label ?? "—"}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {c.is_new ? "Novo" : "Antigo"} · {c.order_count} pedido(s) · Total{" "}
                  {money(c.total_spent)}
                  {c.first_confirmed_at && (
                    <>
                      {" "}
                      · 1.ª{" "}
                      {new Date(c.first_confirmed_at).toLocaleDateString("pt-BR")}
                    </>
                  )}
                  {c.last_confirmed_at && (
                    <>
                      {" "}
                      · Último{" "}
                      {new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")}
                    </>
                  )}
                </p>
              </div>
              {renderClientActions(c, c.needs_follow_up)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
