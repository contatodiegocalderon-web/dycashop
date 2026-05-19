"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderDaySectionHeader } from "@/components/admin/order-day-section-header";
import { useAdminAuth } from "@/contexts/admin-auth";
import { groupOrdersByLocalDay } from "@/lib/order-day-groups";
import type { OrderItemRow, OrderRow } from "@/types";

type PeriodKey =
  | "today"
  | "yesterday"
  | "weekly"
  | "monthly"
  | "yearly"
  | "last7"
  | "last30"
  | "all"
  | "dateRange";

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "all", label: "Todo período" },
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "dateRange", label: "Período personalizado" },
];

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function normalizeKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayOrderAmount(order: OrderRow): number {
  const rawMap = order.sale_amount_by_category;
  const lines = aggregateByCategory(order.order_items ?? []);
  const saleAmount = Number(order.sale_amount ?? 0);

  if (!rawMap || typeof rawMap !== "object") {
    // Legado sem mapa:
    // - alguns pedidos antigos gravaram total em `sale_amount`
    // - outros gravaram preço por peça
    if (lines.length === 1 && lines[0] && lines[0].qty > 1 && saleAmount > 0) {
      // Regra conservadora: só interpreta como preço por peça quando o valor é baixo.
      if (saleAmount <= 120) return Number((saleAmount * lines[0].qty).toFixed(2));
    }
    return Number(saleAmount.toFixed(2));
  }
  const map = rawMap as Record<
    string,
    | number
    | {
        unit_price?: number;
        total?: number;
        qty?: number;
      }
  >;
  const qtyByCategory = new Map(lines.map((l) => [l.label, l.qty]));

  let sumFromStructured = 0;
  for (const [cat, raw] of Object.entries(map)) {
    if (typeof raw === "number") {
      // Legado: número = preço por peça da categoria.
      sumFromStructured += raw * (qtyByCategory.get(cat) ?? 0);
      continue;
    }
    if (raw && typeof raw === "object") {
      const total = typeof raw.total === "number" ? raw.total : null;
      const unit = typeof raw.unit_price === "number" ? raw.unit_price : null;
      if (total !== null) {
        sumFromStructured += total;
      } else if (unit !== null) {
        sumFromStructured += unit * (qtyByCategory.get(cat) ?? 0);
      }
    }
  }

  if (sumFromStructured > 0) {
    if (saleAmount > 0) {
      // Compatibilidade: existem registros antigos em que o mapa foi salvo com semântica diferente.
      // Quando divergir muito, prioriza `sale_amount` (total final do pedido).
      const diffStructured = Math.abs(sumFromStructured - saleAmount);
      const relDiff = diffStructured / Math.max(1, saleAmount);
      if (relDiff > 0.25) return Number(saleAmount.toFixed(2));
    }
    return Number(sumFromStructured.toFixed(2));
  }

  if (saleAmount > 0 && lines.length === 1 && lines[0].qty > 1 && saleAmount <= 120) {
    return Number((saleAmount * lines[0].qty).toFixed(2));
  }
  return Number(saleAmount.toFixed(2));
}

function resolveOrderRevenueByCategory(order: OrderRow): Record<string, number> {
  const lines = aggregateByCategory(order.order_items ?? []);
  const qtyByCategory: Record<string, number> = {};
  const labelByKey: Record<string, string> = {};
  for (const l of lines) {
    const key = normalizeKey(l.label);
    qtyByCategory[key] = (qtyByCategory[key] ?? 0) + l.qty;
    labelByKey[key] = l.label;
  }

  const byCategory: Record<string, number> = {};
  const rawMap = order.sale_amount_by_category;
  if (rawMap && typeof rawMap === "object") {
    const map = rawMap as Record<
      string,
      | number
      | {
          unit_price?: number;
          total?: number;
          qty?: number;
        }
    >;
    for (const [catLabel, raw] of Object.entries(map)) {
      const key = normalizeKey(catLabel);
      const qty = qtyByCategory[key] ?? 0;
      const label = labelByKey[key] ?? catLabel;
      if (typeof raw === "number") {
        byCategory[label] = Number((raw * qty).toFixed(2));
      } else if (raw && typeof raw === "object") {
        const total = typeof raw.total === "number" ? raw.total : null;
        const unit = typeof raw.unit_price === "number" ? raw.unit_price : null;
        if (total !== null) byCategory[label] = Number(total.toFixed(2));
        else if (unit !== null) byCategory[label] = Number((unit * qty).toFixed(2));
      }
    }
  }

  const sumExplicit = Object.values(byCategory).reduce((s, n) => s + Number(n || 0), 0);
  if (sumExplicit > 0) return byCategory;

  const total = displayOrderAmount(order);
  if (lines.length === 1) {
    const label = lines[0]?.label ?? "Sem categoria";
    return { [label]: total };
  }
  return {};
}

function calculateOrderProfit(order: OrderRow, costs: Record<string, number>): number {
  const lines = aggregateByCategory(order.order_items ?? []);
  const revenueByCategory = resolveOrderRevenueByCategory(order);
  const totalRevenue = Object.values(revenueByCategory).reduce((s, n) => s + Number(n || 0), 0);
  const fallbackRevenue = totalRevenue > 0 ? totalRevenue : displayOrderAmount(order);
  const totalPieces = lines.reduce((s, l) => s + l.qty, 0) || 1;

  let profit = 0;
  for (const line of lines) {
    const key = normalizeKey(line.label);
    const unitCost = costs[key] ?? costs[normalizeKey("Sem categoria")] ?? 0;
    const lineCost = line.qty * unitCost;
    const lineRevenue =
      revenueByCategory[line.label] != null
        ? revenueByCategory[line.label]
        : fallbackRevenue * (line.qty / totalPieces);
    profit += lineRevenue - lineCost;
  }
  return Number(profit.toFixed(2));
}

function waLink(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

type SellerFilterOption = { value: string; label: string };

export default function AdminHistoricoPage() {
  const { adminFetch, session } = useAdminAuth();
  /** Dono com login staff (não sessão derivada só da chave API no browser). */
  const isDiegoOwnerUi = session?.role === "owner" && session?.fromApiKey !== true;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("last30");
  const [dateFrom, setDateFrom] = useState<string>(todayYmd());
  const [dateTo, setDateTo] = useState<string>(todayYmd());
  const [sellerScope, setSellerScope] = useState<string>("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<SellerFilterOption[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        status: "PAGO",
        period,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        _: String(Date.now()),
      });
      if (period === "dateRange") {
        if (dateFrom) q.set("dateFrom", dateFrom);
        if (dateTo) q.set("dateTo", dateTo);
      }
      if (isDiegoOwnerUi && sellerScope && sellerScope !== "all") {
        q.set("sellerScope", sellerScope);
      }
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

      const cRes = await adminFetch("/api/admin/category-costs");
      const cText = await cRes.text();
      let cData: {
        error?: string;
        rows?: Array<{ category_label: string; cost_per_piece: number }>;
      } = {};
      try {
        cData = cText ? (JSON.parse(cText) as typeof cData) : {};
      } catch {
        throw new Error("Resposta inválida ao carregar custos por categoria.");
      }
      if (!cRes.ok) throw new Error(cData.error ?? "Falha ao carregar custos por categoria");
      const nextCosts: Record<string, number> = {};
      for (const row of cData.rows ?? []) {
        nextCosts[normalizeKey(row.category_label)] = Number(row.cost_per_piece ?? 0);
      }
      setCosts(nextCosts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, period, dateFrom, dateTo, isDiegoOwnerUi, sellerScope]);

  useEffect(() => {
    if (!isDiegoOwnerUi) {
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
  }, [adminFetch, isDiegoOwnerUi]);

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

  async function deleteOrder(orderId: string) {
    if (!isDiegoOwnerUi) return;
    const firstConfirm = window.confirm(
      "Excluir este pedido do histórico? Deixa de contar nas métricas. O stock na loja e os nomes no Drive mantêm-se como ficaram na confirmação (nada é revertido)."
    );
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(
      `Confirma novamente a exclusão permanente do pedido ${orderId}?`
    );
    if (!secondConfirm) return;
    setDeletingId(orderId);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}`, { method: "DELETE" });
      const text = await res.text();
      let data: { error?: string } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) throw new Error(data.error ?? "Falha ao excluir pedido");
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Histórico
          </h1>
          <p className="text-sm text-stone-600">
            Pedidos confirmados e registados como pagos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDiegoOwnerUi && sellerFilterOptions.length > 0 && (
            <select
              value={sellerScope}
              onChange={(e) => setSellerScope(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
              aria-label="Filtrar por vendedor"
            >
              {sellerFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
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
          {period === "dateRange" && (
            <>
              <label className="flex flex-col gap-0.5 text-xs text-stone-600">
                De
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-stone-600">
                Até
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                />
              </label>
            </>
          )}
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

      <div className="space-y-8">
        {orderDayGroups.map((group) => (
          <section key={group.dayKey}>
            <OrderDaySectionHeader label={group.label} />
            <ul className="mt-4 space-y-4">
              {group.orders.map((order) => {
          const lines = aggregateByCategory(order.order_items ?? []);
          const waHref = waLink(order.customer_whatsapp);
          const revenueByCategory = resolveOrderRevenueByCategory(order);
          const totalValueFromCategories = Object.values(revenueByCategory).reduce(
            (sum, n) => sum + Number(n || 0),
            0
          );
          const totalValue =
            totalValueFromCategories > 0
              ? Number(totalValueFromCategories.toFixed(2))
              : displayOrderAmount(order);
          const profit = calculateOrderProfit(order, costs);
          const expanded = expandedOrders[order.id] === true;
          return (
            <li
              key={order.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
            <p className="text-lg font-bold uppercase tracking-wide text-stone-800">
              {`PEDIDO #${
                order.display_number != null && order.display_number > 0
                  ? order.display_number
                  : "—"
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
              <button
                type="button"
                onClick={() =>
                  setExpandedOrders((prev) => ({
                    ...prev,
                    [order.id]: !expanded,
                  }))
                }
                className="mt-3 text-sm font-medium text-violet-800 underline hover:text-violet-900"
              >
                {expanded ? "Ver menos" : "Ver mais"}
              </button>
              {expanded && (
                <div className="mt-3 border-t border-stone-100 pt-3">
                  {order.sale_amount != null || order.sale_amount_by_category ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-base font-semibold text-emerald-900">
                        <span className="text-emerald-700">Valor total: </span>
                        {totalValue.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                      <p className="text-base font-semibold text-blue-900">
                        <span className="text-blue-700">Lucro: </span>
                        {profit.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs text-stone-400">
                    {new Date(order.confirmed_at ?? order.updated_at).toLocaleString(
                      "pt-BR"
                    )}
                  </p>
                  {order.public_token ? (
                    <p className="mt-2 text-xs">
                      <Link
                        href={`/recibo/${order.public_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-violet-800 underline hover:text-violet-900"
                      >
                        Abrir recibo do cliente
                      </Link>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {waHref && (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#20bd5a]"
                      >
                        Chamar no WhatsApp
                      </a>
                    )}
                    {isDiegoOwnerUi && (
                      <button
                        type="button"
                        onClick={() => void deleteOrder(order.id)}
                        disabled={deletingId === order.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                      >
                        {deletingId === order.id ? "A excluir…" : "Excluir pedido"}
                      </button>
                    )}
                  </div>
                </div>
              )}
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
