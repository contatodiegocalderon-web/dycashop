"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type {
  CustomerSegment,
  OrderItemRow,
  OrderRow,
  ProductSize,
} from "@/types";
import { publicDriveImageUrl } from "@/lib/drive-image-url";
import { formatSyncResultSummary } from "@/lib/format-sync-result";
import { consumeSyncNdjsonStream } from "@/lib/sync-stream-client";
import type { SyncResult } from "@/services/drive-sync";

function errorFromResponseBody(text: string): Error {
  try {
    const j = JSON.parse(text) as { error?: string };
    return new Error((j.error ?? text) || "Falha");
  } catch {
    return new Error(text || "Falha");
  }
}

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

function adminThumbSrc(it: OrderItemRow): string {
  const u = it.snapshot_image_url?.trim() ?? "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return publicDriveImageUrl(it.snapshot_drive_file_id, 280);
}

function groupItems(items: OrderItemRow[]) {
  const m = new Map<ProductSize, OrderItemRow[]>();
  for (const s of SIZE_ORDER) m.set(s, []);
  for (const it of items) {
    const sz = it.snapshot_size as ProductSize;
    if (m.has(sz)) m.get(sz)!.push(it);
  }
  return m;
}

export default function AdminPedidosPage() {
  const { adminFetch, isOwner } = useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelOpenId, setCancelOpenId] = useState<string | null>(null);
  const [cancelPhrase, setCancelPhrase] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    current: number;
    total: number;
    skipped: number;
  } | null>(null);
  const [confirmOpenId, setConfirmOpenId] = useState<string | null>(null);
  const [saleAmount, setSaleAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsApp, setCustomerWhatsApp] = useState("");
  const [customerSegment, setCustomerSegment] =
    useState<CustomerSegment>("NOVO");
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(
    null
  );

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/orders?status=PENDENTE_PAGAMENTO");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setOrders(data.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  async function runDriveImport() {
    setImporting(true);
    setImportMsg(null);
    setImportProgress(null);
    try {
      const res = await adminFetch("/api/import-drive?stream=1", {
        method: "POST",
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        throw errorFromResponseBody(await res.text());
      }
      if (ct.includes("ndjson")) {
        setImportProgress({
          phase: "A iniciar…",
          current: 0,
          total: 0,
          skipped: 0,
        });
        await consumeSyncNdjsonStream(res, (raw) => {
          const o = raw as {
            type?: string;
            phase?: string;
            current?: number;
            total?: number;
            skipped?: number;
            result?: SyncResult;
            message?: string;
          };
          if (o.type === "phase" && o.phase) {
            const msg =
              o.phase === "produtos"
                ? "A atualizar produtos…"
                : o.phase === "imagens"
                  ? "A preparar imagens…"
                  : o.phase === "drive_rename"
                    ? "A alinhar nomes no Drive…"
                    : o.phase;
            setImportProgress((p) => ({
              current: p?.current ?? 0,
              total: p?.total ?? 0,
              skipped: p?.skipped ?? 0,
              phase: msg,
            }));
          }
          if (o.type === "progress" && o.phase === "images") {
            setImportProgress({
              phase: "Imagens → Storage",
              current: o.current ?? 0,
              total: o.total ?? 0,
              skipped: o.skipped ?? 0,
            });
          }
          if (o.type === "complete" && o.result) {
            setImportMsg(formatSyncResultSummary(o.result));
            setImportProgress(null);
          }
          if (o.type === "fatal") {
            setImportMsg(o.message ?? "Erro na importação");
            setImportProgress(null);
          }
        });
        return;
      }
      const data = (await res.json()) as {
        imported?: number;
        message?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setImportMsg(
        typeof data.imported === "number"
          ? `Importados/atualizados: ${data.imported} produtos.`
          : (data.message as string)
      );
    } catch (e) {
      setImportProgress(null);
      setImportMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setImporting(false);
    }
  }

  function openConfirmModal(orderId: string) {
    setConfirmSuccessMsg(null);
    setSaleAmount("");
    setCustomerName("");
    setCustomerWhatsApp("");
    setCustomerSegment("NOVO");
    setConfirmOpenId(orderId);
    setError(null);
  }

  async function submitConfirmPayment(orderId: string) {
    setConfirming(orderId);
    setError(null);
    setConfirmSuccessMsg(null);
    const amount = Number(String(saleAmount).replace(",", "."));
    if (Number.isNaN(amount) || amount <= 0) {
      setError("Informe um valor de venda válido");
      setConfirming(null);
      return;
    }
    if (!customerName.trim()) {
      setError("Informe o nome do cliente");
      setConfirming(null);
      return;
    }
    const waDigits = customerWhatsApp.replace(/\D/g, "");
    if (waDigits.length < 10) {
      setError("Informe um WhatsApp com pelo menos 10 dígitos");
      setConfirming(null);
      return;
    }
    try {
      const res = await adminFetch(
        `/api/admin/orders/confirm/${encodeURIComponent(orderId)}`,
        {
          method: "POST",
          body: JSON.stringify({
            saleAmount: amount,
            customerName: customerName.trim(),
            customerWhatsApp: waDigits,
            customerSegment,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao confirmar");

      const renameErrors = data.driveRename?.errors as
        | { productId: string; message: string }[]
        | undefined;
      if (renameErrors?.length) {
        setConfirmSuccessMsg(
          `Pedido confirmado. Atenção: ${renameErrors.length} renomeação(ões) no Drive falhou(aram). Verifique a API / logs.`
        );
      } else {
        setConfirmSuccessMsg(
          "Pedido confirmado; nomes no Drive atualizados conforme o stock."
        );
      }
      setConfirmOpenId(null);
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setConfirming(null);
    }
  }

  const cancelConfirmEnabled =
    cancelPhrase.trim().toUpperCase() === "CANCELAR";

  async function cancelOrder(orderId: string) {
    if (!cancelConfirmEnabled) return;
    setCancelling(orderId);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/orders/cancel/${encodeURIComponent(orderId)}`,
        {
          method: "POST",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao cancelar");
      setCancelOpenId(null);
      setCancelPhrase("");
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Pedidos pendentes</h1>
          <p className="text-sm text-stone-600">
            Confirme o pagamento para baixar estoque automaticamente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "Carregando…" : "Atualizar pedidos"}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={runDriveImport}
              disabled={importing}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              {importing ? "Sincronizando Drive…" : "Sincronizar Google Drive"}
            </button>
          )}
        </div>
      </div>
      {isOwner && importProgress && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
          <p className="font-medium">{importProgress.phase}</p>
          {importProgress.total > 0 ? (
            <p className="mt-1 text-xs text-emerald-900/90">
              Imagens: {importProgress.current} / {importProgress.total} ·
              Ignoradas: {importProgress.skipped}
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-900/80">A calcular…</p>
          )}
        </div>
      )}
      {isOwner && importMsg && (
        <p className="mb-4 text-sm text-stone-600 whitespace-pre-wrap">
          {importMsg}
        </p>
      )}
      {confirmSuccessMsg && (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {confirmSuccessMsg}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {orders.length === 0 && !loading && (
        <p className="text-stone-600">Nenhum pedido pendente.</p>
      )}

      <ul className="space-y-6">
        {orders.map((order) => {
          const items = order.order_items ?? [];
          const bySize = groupItems(items);
          return (
            <li
              key={order.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm text-stone-500">{order.id}</p>
                  {order.public_token ? (
                    <p className="mt-1 text-xs">
                      <Link
                        href={`/recibo/${order.public_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-emerald-800 underline hover:text-emerald-900"
                      >
                        Abrir recibo do cliente
                      </Link>
                    </p>
                  ) : null}
                  <p className="text-xs text-stone-400">
                    {new Date(order.created_at).toLocaleString("pt-BR")}
                  </p>
                  {order.customer_note && (
                    <p className="mt-2 text-sm text-stone-700">
                      <span className="text-stone-500">CEP: </span>
                      {order.customer_note}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={confirming === order.id || !!cancelling}
                    onClick={() => openConfirmModal(order.id)}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Confirmar pagamento
                  </button>
                  <button
                    type="button"
                    disabled={!!confirming || !!cancelling}
                    onClick={() => {
                      setCancelOpenId((id) =>
                        id === order.id ? null : order.id
                      );
                      setCancelPhrase("");
                    }}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancelOpenId === order.id ? "Fechar" : "Cancelar pedido"}
                  </button>
                </div>
              </div>

              {confirmOpenId === order.id && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-4 text-sm text-stone-900">
                  <p className="font-semibold text-emerald-950">
                    Confirmar venda e baixar estoque
                  </p>
                  <p className="mt-1 text-emerald-900/90">
                    Os dados abaixo entram nas métricas e disparam a renomeação das fotos no Drive.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-stone-600">
                      Valor do pedido (R$)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={saleAmount}
                        onChange={(e) => setSaleAmount(e.target.value)}
                        placeholder="199,90"
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-900"
                      />
                    </label>
                    <label className="block text-xs font-medium text-stone-600">
                      Nome do cliente
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-900"
                      />
                    </label>
                    <label className="block text-xs font-medium text-stone-600 sm:col-span-2">
                      WhatsApp
                      <input
                        type="tel"
                        value={customerWhatsApp}
                        onChange={(e) => setCustomerWhatsApp(e.target.value)}
                        placeholder="5511999999999"
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-900"
                      />
                    </label>
                  </div>
                  <fieldset className="mt-3">
                    <legend className="text-xs font-medium text-stone-600">
                      Cliente
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`seg-${order.id}`}
                          checked={customerSegment === "NOVO"}
                          onChange={() => setCustomerSegment("NOVO")}
                        />
                        Novo
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`seg-${order.id}`}
                          checked={customerSegment === "ANTIGO"}
                          onChange={() => setCustomerSegment("ANTIGO")}
                        />
                        Antigo
                      </label>
                    </div>
                  </fieldset>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={confirming === order.id}
                      onClick={() => submitConfirmPayment(order.id)}
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {confirming === order.id ? "Confirmando…" : "Registrar e confirmar"}
                    </button>
                    <button
                      type="button"
                      disabled={!!confirming}
                      onClick={() => setConfirmOpenId(null)}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {cancelOpenId === order.id && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-950">
                  <p className="font-medium">Cancelar este pedido?</p>
                  <p className="mt-1 text-red-900/90">
                    O cliente verá o estado como cancelado no recibo. Esta ação não
                    pode ser desfeita.
                  </p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-red-800">
                    Confirmação (2.º passo): digite{" "}
                    <span className="font-mono">CANCELAR</span>
                  </p>
                  <input
                    type="text"
                    value={cancelPhrase}
                    onChange={(e) => setCancelPhrase(e.target.value)}
                    autoComplete="off"
                    placeholder="Digite CANCELAR"
                    className="mt-2 w-full max-w-xs rounded-lg border border-red-300 bg-white px-3 py-2 font-mono text-sm text-stone-900"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        !cancelConfirmEnabled ||
                        cancelling === order.id ||
                        !!confirming
                      }
                      onClick={() => cancelOrder(order.id)}
                      className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {cancelling === order.id
                        ? "Cancelando…"
                        : "Confirmar cancelamento"}
                    </button>
                    <button
                      type="button"
                      disabled={!!cancelling}
                      onClick={() => {
                        setCancelOpenId(null);
                        setCancelPhrase("");
                      }}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50"
                    >
                      Desistir
                    </button>
                  </div>
                </div>
              )}

              {SIZE_ORDER.map((size) => {
                const list = bySize.get(size) ?? [];
                if (!list.length) return null;
                return (
                  <div key={size} className="mb-4 last:mb-0">
                    <h3 className="mb-2 text-sm font-semibold text-stone-800">
                      Tamanho {size}
                    </h3>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {list.map((it) => (
                        <li
                          key={it.id}
                          className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-2"
                        >
                          <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                            <img
                              src={adminThumbSrc(it)}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-stone-900">
                              {it.snapshot_brand} — {it.snapshot_color}{" "}
                              <span className="text-stone-500">×{it.quantity}</span>
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
