"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderDaySectionHeader } from "@/components/admin/order-day-section-header";
import { useAdminAuth } from "@/contexts/admin-auth";
import { orderItemImageUrl } from "@/lib/order-item-image-url";
import { groupOrdersByLocalDay } from "@/lib/order-day-groups";
import type { OrderItemRow, OrderRow } from "@/types";

type PeriodKey = "last7" | "last30" | "all";
type FulfillmentStatus = "EM_ABERTO" | "SEPARADO" | "DESPACHADO";

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "last30", label: "Últimos 30 dias" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "all", label: "Todo período" },
];

const FULFILLMENT_OPTIONS: Array<{
  value: FulfillmentStatus;
  label: string;
  className: string;
}> = [
  {
    value: "EM_ABERTO",
    label: "Em aberto",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  {
    value: "SEPARADO",
    label: "Separado",
    className: "border-sky-300 bg-sky-50 text-sky-900",
  },
  {
    value: "DESPACHADO",
    label: "Despachado",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
];

const EMPTY_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function totalPieces(order: OrderRow): number {
  return (order.order_items ?? []).reduce((s, it) => s + Number(it.quantity ?? 0), 0);
}

function fmtCep(cep: string | undefined): string {
  const d = String(cep ?? "").replace(/\D/g, "");
  if (d.length !== 8) return cep?.trim() || "—";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function fmtCpf(cpf: string | undefined): string {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return cpf?.trim() || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function itemLabel(it: OrderItemRow): string {
  const brand = String(it.snapshot_brand ?? "").trim() || "—";
  const color = String(it.snapshot_color ?? "").trim();
  const size = String(it.snapshot_size ?? "").trim();
  const parts = [brand];
  if (color) parts.push(color);
  if (size) parts.push(size);
  return parts.join(" · ");
}

function thumbSrc(it: OrderItemRow): string {
  return orderItemImageUrl(it, 280) ?? EMPTY_IMG;
}

function waLink(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

function fulfillmentOf(order: OrderRow): FulfillmentStatus {
  const s = order.varejo_fulfillment_status;
  if (s === "SEPARADO" || s === "DESPACHADO") return s;
  return "EM_ABERTO";
}

function ShippingBlock({ order }: { order: OrderRow }) {
  const addr = order.shipping_address;
  if (!addr || typeof addr !== "object") {
    return order.customer_note?.trim() ? (
      <p className="mt-3 text-sm text-stone-600">
        <span className="font-semibold text-stone-800">Envio: </span>
        {order.customer_note.trim()}
      </p>
    ) : (
      <p className="mt-3 text-sm text-amber-700">
        Endereço de envio não informado neste pedido.
      </p>
    );
  }

  const line1 = [
    addr.street?.trim(),
    addr.number?.trim() ? `nº ${addr.number.trim()}` : null,
    addr.complement?.trim() || null,
  ]
    .filter(Boolean)
    .join(", ");

  const line2 = [
    addr.neighborhood?.trim(),
    addr.city?.trim(),
    addr.state?.trim()?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        Endereço de envio
        {order.shipping_service?.trim()
          ? ` · ${order.shipping_service.trim()}`
          : ""}
      </p>
      {addr.recipientName?.trim() ? (
        <p className="mt-1 font-medium text-stone-800">{addr.recipientName.trim()}</p>
      ) : null}
      {line1 ? <p className="mt-0.5">{line1}</p> : null}
      {line2 ? <p>{line2}</p> : null}
      <p className="mt-1 text-stone-600">
        CEP {fmtCep(addr.cep)}
        {addr.cpf ? ` · CPF ${fmtCpf(addr.cpf)}` : ""}
      </p>
    </div>
  );
}

export default function AdminVarejoPage() {
  const { adminFetch } = useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("last30");
  const [savingId, setSavingId] = useState<string | null>(null);

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

  const updateFulfillment = useCallback(
    async (orderId: string, status: FulfillmentStatus) => {
      setSavingId(orderId);
      setError(null);
      let previous: FulfillmentStatus = "EM_ABERTO";
      setOrders((list) => {
        const cur = list.find((o) => o.id === orderId);
        previous = fulfillmentOf(cur ?? ({} as OrderRow));
        return list.map((o) =>
          o.id === orderId ? { ...o, varejo_fulfillment_status: status } : o
        );
      });
      try {
        const res = await adminFetch("/api/admin/varejo-orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            varejo_fulfillment_status: status,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Falha ao atualizar status");
      } catch (e) {
        setOrders((list) =>
          list.map((o) =>
            o.id === orderId
              ? { ...o, varejo_fulfillment_status: previous }
              : o
          )
        );
        setError(e instanceof Error ? e.message : "Erro ao salvar status");
      } finally {
        setSavingId(null);
      }
    },
    [adminFetch]
  );

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
            Pedidos pagos online (1 a 4 peças). Separe, chame o cliente e marque o
            status até o despacho.
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
                const items = order.order_items ?? [];
                const pieces = totalPieces(order);
                const amount = Number(order.sale_amount ?? 0);
                const wa = waLink(order.customer_whatsapp);
                const fulfillment = fulfillmentOf(order);
                const statusOpt = FULFILLMENT_OPTIONS.find(
                  (o) => o.value === fulfillment
                );

                return (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
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
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width={16}
                              height={16}
                              fill="currentColor"
                              aria-hidden
                            >
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            WhatsApp
                          </a>
                        ) : null}
                        <select
                          value={fulfillment}
                          disabled={savingId === order.id}
                          onChange={(e) =>
                            void updateFulfillment(
                              order.id,
                              e.target.value as FulfillmentStatus
                            )
                          }
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                            statusOpt?.className ??
                            "border-stone-300 bg-white text-stone-800"
                          }`}
                          aria-label="Status de separação"
                        >
                          {FULFILLMENT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {items.length > 0 ? (
                      <ul className="mt-4 space-y-2">
                        {items.map((it) => (
                          <li
                            key={it.id}
                            className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-2"
                          >
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbSrc(it)}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                            <div className="min-w-0 text-sm">
                              <p className="font-semibold text-stone-900">
                                <span className="tabular-nums text-stone-500">
                                  {it.quantity}x
                                </span>{" "}
                                {itemLabel(it)}
                              </p>
                              {it.snapshot_category?.trim() ? (
                                <p className="mt-0.5 text-xs text-stone-500">
                                  {it.snapshot_category.trim()}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-amber-700">
                        Nenhum item encontrado neste pedido.
                      </p>
                    )}

                    <ShippingBlock order={order} />

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
