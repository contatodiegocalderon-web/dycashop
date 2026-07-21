"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import { publicDriveImageUrl } from "@/lib/drive-image-url";
import type { OrderItemRow, OrderRow, ProductSize } from "@/types";

type PeriodKey = "last30" | "all" | "today" | "weekly" | "monthly";

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "all", label: "Todo período" },
];

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

const EMPTY_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

function adminThumbSrc(it: OrderItemRow): string {
  const u = it.snapshot_image_url?.trim() ?? "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const fid = it.snapshot_drive_file_id?.trim();
  if (!fid) return EMPTY_IMG;
  return publicDriveImageUrl(fid, 280);
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

function aggregateByCategory(
  items: OrderItemRow[]
): Array<{ label: string; qty: number }> {
  const map = new Map<string, number>();
  for (const it of items) {
    const cat = it.snapshot_category?.trim() || "Sem categoria";
    map.set(cat, (map.get(cat) ?? 0) + it.quantity);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, qty]) => ({ label, qty }));
}

function displayOrderAmount(order: OrderRow): number {
  const saleAmount = Number(order.sale_amount ?? 0);
  if (saleAmount > 0) return Number(saleAmount.toFixed(2));
  return 0;
}

function totalPieces(order: OrderRow): number {
  return (order.order_items ?? []).reduce((s, it) => s + it.quantity, 0);
}

function waLink(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

export default function AdminVarejoPage() {
  const { adminFetch } = useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("last30");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const q = new URLSearchParams({
        status: "PAGO",
        channel: "VAREJO",
        period,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
      });
      const res = await adminFetch(`/api/admin/orders?${q.toString()}`);
      const text = await res.text();
      let data: { error?: string; hint?: string; orders?: OrderRow[] } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) {
        if (data.hint) setHint(data.hint);
        throw new Error(data.error ?? "Falha ao carregar pedidos de varejo");
      }
      if (data.hint) setHint(data.hint);
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
          <h1 className="text-2xl font-bold text-stone-900">Varejo</h1>
          <p className="text-sm text-stone-600">
            Pedidos pagos online (1 a 9 peças). A aba Pedidos (WhatsApp) não
            muda — aqui só entram vendas do canal Varejo.
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
          <p>{error}</p>
          {hint && <p className="mt-1 text-red-700/90">{hint}</p>}
        </div>
      )}

      {!error && hint && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {hint}
        </div>
      )}

      {orders.length === 0 && !loading && !error && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 px-6 py-10 text-center">
          <p className="text-base font-medium text-stone-800">
            Ainda não há pedidos de varejo pagos
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Quando o Mercado Pago estiver ligado, os pedidos com
            sales_channel=VAREJO e status PAGO aparecem aqui.
          </p>
        </div>
      )}

      <ul className="space-y-4">
        {orders.map((order) => {
          const lines = aggregateByCategory(order.order_items ?? []);
          const bySize = groupItems(order.order_items ?? []);
          const waHref = waLink(order.customer_whatsapp);
          const total = displayOrderAmount(order);
          const pieces = totalPieces(order);
          const paidAt = order.confirmed_at || order.updated_at;

          return (
            <li
              key={order.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold uppercase tracking-wide text-stone-800">
                    {`PEDIDO #${order.display_number ?? "—"}`}
                  </p>
                  <p className="font-mono text-xs text-stone-500">{order.id}</p>
                </div>
                <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-900">
                  Varejo · pago
                </span>
              </div>

              <p className="mt-2 text-sm text-stone-700">
                <span className="text-stone-500">Cliente: </span>
                {order.customer_name?.trim() || "—"}
              </p>
              <p className="text-sm text-stone-700">
                <span className="text-stone-500">Peças: </span>
                {pieces}
              </p>
              {order.payment_external_id && (
                <p className="text-sm text-stone-700">
                  <span className="text-stone-500">Pagamento: </span>
                  <span className="font-mono text-xs">
                    {order.payment_provider
                      ? `${order.payment_provider} · `
                      : ""}
                    {order.payment_external_id}
                  </span>
                </p>
              )}

              {lines.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm italic text-stone-700">
                  {lines.map((line) => (
                    <li key={`${order.id}:${line.label}`}>
                      {`x${line.qty} ${line.label}`}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 space-y-3">
                {SIZE_ORDER.map((size) => {
                  const items = bySize.get(size) ?? [];
                  if (!items.length) return null;
                  return (
                    <div key={`${order.id}:${size}`}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        {size}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {items.map((it) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={it.id}
                            src={adminThumbSrc(it)}
                            alt={`${it.snapshot_brand} ${it.snapshot_color}`}
                            width={72}
                            height={72}
                            className="h-[72px] w-[72px] rounded-lg object-cover ring-1 ring-stone-200"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {total > 0 && (
                <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <p className="text-base font-semibold text-cyan-950">
                    <span className="text-cyan-800">Valor pago: </span>
                    {total.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
              )}

              <p className="mt-2 text-xs text-stone-400">
                Pago em {new Date(paidAt).toLocaleString("pt-BR")}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {order.public_token && (
                  <Link
                    href={`/recibo/${order.public_token}`}
                    target="_blank"
                    className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
                  >
                    Ver recibo
                  </Link>
                )}
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
