"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { AbandonedOrderRow } from "@/app/api/admin/abandoned-carts/route";
import { totalsByCategoryFromOrderItems } from "@/lib/order-category-totals";
import { SITE_VAREJO_SELLER } from "@/lib/crm-legacy-import";

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
  if (order.requested_seller_name?.trim() === SITE_VAREJO_SELLER) {
    return `${hi} Vi que você deixou itens no carrinho do site. Posso ajudar a finalizar?`;
  }
  const cats = totalsByCategoryFromOrderItems(order.order_items);
  const summary = cats.map((c) => `x${c.qty} ${c.label}`).join("\n");

  return summary
    ? `${hi}\n\nVi que você deixou itens no carrinho:\n${summary}\n\nPosso ajudar a finalizar?`
    : `${hi} Vi que você deixou itens no carrinho. Posso ajudar a finalizar?`;
}

function formatCategoryLines(order: AbandonedOrderRow): string[] {
  return totalsByCategoryFromOrderItems(order.order_items).map(
    (c) => `x${c.qty} ${c.label.toUpperCase()}`
  );
}

type Props = {
  active: boolean;
};

export function AbandonedCartsPanel({ active }: Props) {
  const { adminFetch } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<AbandonedOrderRow[]>([]);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/abandoned-carts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.hint ?? "Falha ao carregar");
      const list = (data.orders ?? []) as AbandonedOrderRow[];
      setOrders(list);
      const counts: Record<string, number> = {};
      for (const o of list) {
        counts[o.customer_whatsapp] = o.whatsapp_click_count ?? 0;
      }
      setClickCounts(counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setOrders([]);
      setClickCounts({});
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function trackWhatsAppClick(wa: string, msg: string) {
    try {
      const res = await adminFetch("/api/admin/abandoned-carts/whatsapp-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_whatsapp: wa }),
      });
      const data = await res.json();
      if (res.ok && typeof data.click_count === "number") {
        setClickCounts((prev) => ({ ...prev, [wa]: data.click_count }));
      }
    } catch {
      setClickCounts((prev) => ({
        ...prev,
        [wa]: (prev[wa] ?? 0) + 1,
      }));
    }
    window.open(waLink(wa, msg), "_blank", "noopener,noreferrer");
  }

  if (!active) return null;

  return (
    <div>
      <p className="mb-4 text-sm text-stone-600">
        Clientes com pedido cancelado no sistema (sem pedido em aberto). O contador
        mostra quantas vezes você abriu o WhatsApp de cada número.
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
          Nenhum carrinho abandonado no momento.
        </p>
      )}

      <ul className="space-y-3">
        {orders.map((order) => {
          const msg = recoveryMessage(order);
          const lines = formatCategoryLines(order);
          const clicks = clickCounts[order.customer_whatsapp] ?? 0;
          const isSiteVarejo =
            order.requested_seller_name?.trim() === SITE_VAREJO_SELLER;

          return (
            <li
              key={order.order_id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900">
                  {order.customer_name?.trim() || "—"}
                </p>
                <p className="text-sm text-stone-500">
                  {waDisplay(order.customer_whatsapp)}
                </p>
                {isSiteVarejo ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
                    {SITE_VAREJO_SELLER}
                  </p>
                ) : (
                  <>
                    {order.requested_seller_name?.trim() ? (
                      <p className="mt-1 text-xs text-stone-500">
                        {order.requested_seller_name.trim()}
                      </p>
                    ) : null}
                    {lines.length > 0 && (
                      <ul className="mt-2 space-y-0.5 font-mono text-xs uppercase tracking-wide text-stone-700">
                        {lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <p className="mt-2 text-[11px] text-stone-400">
                  {new Date(order.created_at).toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => void trackWhatsAppClick(order.customer_whatsapp, msg)}
                  className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#20bd5a]"
                >
                  WhatsApp
                </button>
                <p className="text-[11px] text-stone-500">
                  {clicks === 0
                    ? "Nenhum clique ainda"
                    : clicks === 1
                      ? "1 clique no WhatsApp"
                      : `${clicks} cliques no WhatsApp`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
