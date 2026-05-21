"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { AbandonedOrderRow } from "@/app/api/admin/abandoned-carts/route";
import { totalsByCategoryFromOrderItems } from "@/lib/order-category-totals";

function waDisplay(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 11) return d;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

function waLink(digits: string, text?: string) {
  const base = `https://wa.me/${digits.replace(/\D/g, "")}`;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

function recoveryMessage(order: AbandonedOrderRow): string {
  const first = order.customer_name?.trim().split(/\s+/)[0];
  const hi = first ? `Olá ${first}!` : "Olá!";
  const num =
    order.display_number != null ? `PEDIDO #${order.display_number}` : "seu pedido";
  const cats = totalsByCategoryFromOrderItems(order.order_items);
  const summary = cats.map((c) => `x${c.qty} ${c.label}`).join(", ");

  if (order.status === "CANCELADO") {
    return `${hi} O ${num} foi cancelado, mas ainda podemos ajudar a concluir a compra.${summary ? ` Itens: ${summary}.` : ""}`;
  }
  return `${hi} O ${num} está aguardando confirmação de pagamento.${summary ? ` Itens: ${summary}.` : ""} Posso ajudar a finalizar?`;
}

const STATUS_LABEL = {
  PENDENTE_PAGAMENTO: "Pendente",
  CANCELADO: "Cancelado",
} as const;

type Props = {
  active: boolean;
};

export function AbandonedCartsPanel({ active }: Props) {
  const { adminFetch } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<AbandonedOrderRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/abandoned-carts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.hint ?? "Falha ao carregar");
      setOrders((data.orders ?? []) as AbandonedOrderRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  if (!active) return null;

  return (
    <div>
      <p className="mb-4 text-sm text-stone-600">
        Pedidos <strong>pendentes</strong> ou <strong>cancelados</strong> de quem ainda
        não tem nenhuma compra confirmada. Quando o primeiro pedido for confirmado (PAGO),
        o contacto passa para <strong>Registados</strong> e deixa de aparecer aqui.
      </p>

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="mb-6 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
      >
        {loading ? "A carregar…" : "Atualizar"}
      </button>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loading && orders.length === 0 && !error && (
        <p className="text-sm text-stone-500">
          Nenhum pedido pendente ou cancelado de cliente sem compra confirmada.
        </p>
      )}

      <ul className="space-y-4">
        {orders.map((order) => {
          const msg = recoveryMessage(order);
          return (
            <li
              key={order.order_id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-900">
                      {order.display_number != null
                        ? `PEDIDO #${order.display_number}`
                        : "Pedido"}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        order.status === "PENDENTE_PAGAMENTO"
                          ? "bg-amber-100 text-amber-950"
                          : "bg-red-100 text-red-900"
                      }`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-stone-800">
                    {order.customer_name?.trim() || "—"}
                  </p>
                  <p className="text-sm text-stone-600">
                    {waDisplay(order.customer_whatsapp)}
                  </p>
                  {order.requested_seller_name && (
                    <p className="mt-0.5 text-xs text-stone-500">
                      Vendedor escolhido: {order.requested_seller_name}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-stone-500">
                    {new Date(order.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  {order.public_token ? (
                    <Link
                      href={`/recibo/${order.public_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      Abrir recibo
                    </Link>
                  ) : null}
                  <a
                    href={waLink(order.customer_whatsapp, msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-[#20bd5a]"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
