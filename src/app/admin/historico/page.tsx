"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import { displayNumberFromOrderedIds } from "@/lib/order-display-number";
import type { OrderItemRow, OrderRow } from "@/types";

type PeriodKey = "daily" | "weekly" | "monthly" | "yearly" | "last30";

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
  { value: "last30", label: "Últimos 30 dias" },
];

function aggregateByCategory(items: OrderItemRow[]): Array<{ label: string; qty: number }> {
  const m = new Map<string, number>();
  for (const it of items) {
    const cat = it.snapshot_category?.trim() || "Sem categoria";
    m.set(cat, (m.get(cat) ?? 0) + it.quantity);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, qty]) => ({ label, qty }));
}

function waLink(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

export default function AdminHistoricoPage() {
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
        status: "PAGO",
        period,
      });
      const res = await adminFetch(`/api/admin/orders?${q.toString()}`);
      const text = await res.text();
      let data: { error?: string; orders?: OrderRow[] } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar histórico");
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Histórico</h1>
          <p className="text-sm text-stone-600">
            Pedidos confirmados e registados como pagos.
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
            Voltar para pedidos
          </Link>
          <button
            type="button"
            onClick={fetchOrders}
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
        <p className="text-stone-600">Nenhum pedido confirmado ainda.</p>
      )}

      <ul className="space-y-4">
        {orders.map((order) => {
          const lines = aggregateByCategory(order.order_items ?? []);
          const waHref = waLink(order.customer_whatsapp);
          return (
            <li
              key={order.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
            <p className="text-lg font-bold uppercase tracking-wide text-stone-800">
              {`PEDIDO #${
                order.display_number ??
                displayNumberFromOrderedIds(
                  orders.map((o) => o.id),
                  order.id
                )
              }`}
            </p>
            <p className="font-mono text-xs text-stone-500">{order.id}</p>
            <p className="mt-2 text-sm text-stone-700">
              <span className="text-stone-500">Cliente: </span>
              {order.customer_name?.trim() || "—"}
            </p>
            <p className="text-sm text-stone-700">
              <span className="text-stone-500">Vendedor: </span>
              {order.confirmed_by_staff_name?.trim() || "—"}
            </p>
            {lines.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm italic text-stone-700">
                {lines.map((line) => (
                  <li key={`${order.id}:${line.label}`}>{`x${line.qty} ${line.label}`}</li>
                ))}
              </ul>
            )}
            {order.customer_whatsapp?.trim() ? (
              <p className="text-sm text-stone-700">
                <span className="text-stone-500">WhatsApp: </span>
                {order.customer_whatsapp}
              </p>
            ) : null}
            {order.sale_amount != null ? (
              <p className="text-sm text-stone-700">
                <span className="text-stone-500">Valor: </span>
                {order.sale_amount.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-stone-400">
              {new Date(order.updated_at).toLocaleString("pt-BR")}
            </p>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#20bd5a]"
              >
                Chamar no WhatsApp
              </a>
            )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
