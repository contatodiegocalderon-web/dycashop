"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";

type ClientRow = {
  customer_whatsapp: string;
  customer_name: string | null;
  customer_segment: string | null;
  is_new: boolean;
  order_count: number;
  total_spent: number;
  last_confirmed_at: string | null;
  sellers_label: string;
};

type SellerFilterOption = { value: string; label: string };

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
  const d = digits.replace(/\D/g, "");
  return `https://wa.me/${d}`;
}

function clientsToCsv(rows: ClientRow[]): string {
  const header = [
    "nome",
    "whatsapp",
    "vendedor",
    "segmento",
    "pedidos",
    "total_gasto",
    "ultimo_pedido",
  ];
  const lines = [header.join(",")];
  for (const c of rows) {
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
    lines.push(
      [
        `"${name}"`,
        c.customer_whatsapp,
        `"${sellers}"`,
        seg,
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
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [removingWa, setRemovingWa] = useState<string | null>(null);
  const [sellerScope, setSellerScope] = useState<string>("all");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setClients([]);
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

  /** Mais recente no topo (último pedido confirmado). */
  const sorted = useMemo(
    () =>
      [...clients].sort((a, b) => {
        const ta = a.last_confirmed_at ?? "";
        const tb = b.last_confirmed_at ?? "";
        const byDate = tb.localeCompare(ta);
        if (byDate !== 0) return byDate;
        return (a.customer_name ?? "").localeCompare(b.customer_name ?? "", "pt-BR");
      }),
    [clients]
  );

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
    if (!sorted.length) return;
    downloadBlob(
      `clientes-dycashop-${new Date().toISOString().slice(0, 10)}.csv`,
      clientsToCsv(sorted),
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
          Clientes registados
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Leads e compradores com pedido confirmado. Use a lista para follow-up, campanhas e
          acompanhamento de vendas. A exportação abre no Excel ou no Google Sheets.
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

      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
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
              aria-label="Filtrar clientes por vendedor"
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
          onClick={exportCsv}
          disabled={loading || sorted.length === 0}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-stone-800 disabled:opacity-40"
        >
          Exportar CSV
        </button>
        <label className="cursor-pointer rounded-xl border border-stone-300 bg-stone-50 px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-100">
          Importar CSV (pré-visualização)
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

      {!loading && sorted.length === 0 && !error && (
        <p className="text-sm text-stone-500">
          Ainda não há clientes — confirme um pedido com nome e WhatsApp em Pedidos.
        </p>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg shadow-stone-900/5">
          {sorted.map((c) => (
            <li
              key={c.customer_whatsapp}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50/80"
            >
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">{c.customer_name ?? "—"}</p>
                <p className="text-sm text-stone-500">{waDisplay(c.customer_whatsapp)}</p>
                <p className="mt-1 text-sm text-stone-700">
                  <span className="text-stone-500">Vendedor: </span>
                  {c.sellers_label ?? "—"}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {c.is_new ? "🆕 Novo" : "Antigo"}{" "}
                  · {c.order_count} pedido(s) · Total {money(c.total_spent)}
                  {c.last_confirmed_at && (
                    <>
                      {" "}
                      · Último{" "}
                      {new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void removeContact(c.customer_whatsapp)}
                  disabled={removingWa === c.customer_whatsapp}
                  className="inline-flex items-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
                >
                  {removingWa === c.customer_whatsapp ? "A remover…" : "Remover da lista"}
                </button>
                <a
                  href={waLink(c.customer_whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#20bd5a]"
                >
                  WhatsApp
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
