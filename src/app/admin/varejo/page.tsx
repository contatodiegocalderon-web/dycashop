"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderDaySectionHeader } from "@/components/admin/order-day-section-header";
import { useAdminAuth } from "@/contexts/admin-auth";
import { groupOrdersByLocalDay } from "@/lib/order-day-groups";
import { totalsByCategoryFromOrderItems } from "@/lib/order-category-totals";
import type { OrderRow } from "@/types";

type PeriodKey = "last7" | "last30" | "all";

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "last30", label: "Últimos 30 dias" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "all", label: "Todo período" },
];

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function totalPieces(order: OrderRow): number {
  return (order.order_items ?? []).reduce((s, it) => s + Number(it.quantity ?? 0), 0);
}

export default function AdminVarejoPage() {
  const { adminFetch } = useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("last30");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        period,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        _: String(Date.now()),
      });
      const res = await adminFetch(`/api/admin/varejo-orders?${q.toString()}`);
      const data = (await res.json()) as { error?: string; orders?: OrderRow[] };
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar pedidos varejo");
      setOrders(data.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, period]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const orderDayGroups = useMemo(
    () =>
      groupOrdersByLocalDay(
        orders,
        (o) => o.confirmed_at ?? o.updated_at ?? o.created_at
      ),
    [orders]
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Varejo
          </h1>
          <p className="text-sm text-stone-600">
            Pedidos pagos online (1 a 4 peças). A aba Pedidos (WhatsApp) não muda — aqui só
            entram vendas do canal Varejo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Link
            href="/admin/pedidos"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Pedidos
          </Link>
          <button
            type="button"
            onClick={() => void fetchOrders()}
            disabled={loading}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {orders.length === 0 && !loading && (
        <div className="rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-stone-800">
            Ainda não há pedidos de varejo pagos
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Quando o checkout online estiver ativo, pedidos com{" "}
            <code className="rounded bg-stone-100 px-1 text-xs">sales_channel=VAREJO</code> e
            status <strong>PAGO</strong> aparecem aqui.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {orderDayGroups.map((group) => (
          <section key={group.dayKey}>
            <OrderDaySectionHeader label={group.label} />
            <ul className="mt-4 space-y-4">
              {group.orders.map((order) => {
                const lines = totalsByCategoryFromOrderItems(order.order_items ?? []);
                const pieces = totalPieces(order);
                const amount = Number(order.sale_amount ?? 0);
                return (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-lg font-bold uppercase tracking-wide text-stone-800">
                      PEDIDO #
                      {order.display_number != null && order.display_number > 0
                        ? order.display_number
                        : "—"}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {order.customer_name?.trim() || "—"}
                      {order.customer_whatsapp
                        ? ` · ${order.customer_whatsapp}`
                        : ""}
                    </p>
                    <ul className="mt-2 space-y-0.5 text-sm text-stone-700">
                      {lines.map((line) => (
                        <li key={`${order.id}:${line.label}`}>
                          {line.qty}x {line.label}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm font-semibold text-emerald-700">
                      {fmtMoney(amount)}
                      {order.shipping_cost != null && Number(order.shipping_cost) > 0
                        ? ` · frete ${fmtMoney(Number(order.shipping_cost))}`
                        : ""}
                      {" · "}
                      {pieces} {pieces === 1 ? "peça" : "peças"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
