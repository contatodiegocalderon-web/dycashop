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

function waLinkFromDigits(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

export default function AdminPedidosPage() {
  const { adminFetch } = useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelOpenId, setCancelOpenId] = useState<string | null>(null);
  const [cancelPhrase, setCancelPhrase] = useState("");
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

  function openConfirmModal(orderId: string) {
    setConfirmSuccessMsg(null);
    setSaleAmount("");
    const found = orders.find((o) => o.id === orderId);
    setCustomerName(found?.customer_name?.trim() ?? "");
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
            Confirme pagamento para baixar estoque; após confirmar, o sistema já
            aplica automaticamente os nomes atualizados no Drive.
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
        </div>
      </div>
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
          const waHref = waLinkFromDigits(order.customer_whatsapp);
          return (
            <li
              key={order.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold uppercase tracking-wide text-stone-800">
                    PEDIDO #{orders.length - orders.findIndex((o) => o.id === order.id)}
                  </p>
                  <p className="font-mono text-xs text-stone-500">{order.id}</p>
                  {order.customer_name && (
                    <p className="mt-1 text-sm text-stone-800">
                      <span className="text-stone-500">Cliente: </span>
                      {order.customer_name}
                    </p>
                  )}
                  {order.requested_seller_name && (
                    <p className="text-sm text-stone-700">
                      <span className="text-stone-500">Vendedor escolhido: </span>
                      {order.requested_seller_name}
                    </p>
                  )}
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
                  {waHref ? (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir conversa no WhatsApp"
                      aria-label="Abrir conversa no WhatsApp"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-white shadow hover:bg-[#20bd5a]"
                    >
                      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
                        <path
                          fill="currentColor"
                          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"
                        />
                      </svg>
                    </a>
                  ) : (
                    <span
                      title="Cliente não informou WhatsApp no pedido"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-stone-200 text-stone-500"
                    >
                      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
                        <path
                          fill="currentColor"
                          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"
                        />
                      </svg>
                    </span>
                  )}
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
