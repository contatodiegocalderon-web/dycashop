import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchOrderDisplayNumberPublic } from "@/lib/order-display-number";
import { ReceiptCancelledMessage } from "@/components/receipt-cancelled";
import { StockConflictNotice } from "@/components/stock-conflict-notice";
import {
  getOrderReceiptByToken,
  isCancelledReceiptToken,
  isValidReceiptToken,
  isVarejoOnlineOrder,
} from "@/lib/order-receipt";
import { totalsByCategoryFromOrderItems } from "@/lib/order-category-totals";
import { orderItemImageUrl } from "@/lib/order-item-image-url";
import type { OrderItemRow, OrderStatus, ProductSize } from "@/types";

type Props = {
  params: { token: string };
  searchParams: { paid?: string; pending?: string };
};

export const dynamic = "force-dynamic";

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

function groupItems(items: OrderItemRow[]) {
  const m = new Map<ProductSize, OrderItemRow[]>();
  for (const s of SIZE_ORDER) m.set(s, []);
  for (const it of items) {
    const sz = it.snapshot_size as ProductSize;
    if (m.has(sz)) m.get(sz)!.push(it);
  }
  return m;
}

function itemImageSrc(it: OrderItemRow): string {
  return orderItemImageUrl(it, 320) ?? "";
}

function statusLabel(
  s: OrderStatus,
  opts?: { varejoConfirmed?: boolean }
): string {
  switch (s) {
    case "PENDENTE_PAGAMENTO":
      return opts?.varejoConfirmed
        ? "Pagamento confirmado · Em preparação"
        : "Aguardando confirmação do vendedor";
    case "PAGO":
      return opts?.varejoConfirmed
        ? "Pagamento confirmado · Em preparação"
        : "Pagamento confirmado";
    case "CANCELADO":
      return "Pedido cancelado";
    default:
      return s;
  }
}

export default async function ReciboPage({ params, searchParams }: Props) {
  const token = params.token;
  if (!isValidReceiptToken(token)) notFound();

  const receipt = await getOrderReceiptByToken(token);
  if (!receipt) {
    if (await isCancelledReceiptToken(token)) {
      return <ReceiptCancelledMessage />;
    }
    notFound();
  }

  const { order, items } = receipt;

  if (order.status === "CANCELADO") {
    return <ReceiptCancelledMessage />;
  }
  const displayNumber =
    order.display_number != null && order.display_number > 0
      ? order.display_number
      : await fetchOrderDisplayNumberPublic(order.id);
  const bySize = groupItems(items);
  const categoryTotals = totalsByCategoryFromOrderItems(items);
  const varejoOnline = isVarejoOnlineOrder(order);
  const fromMpPaid = searchParams.paid === "1";
  const fromMpPending = searchParams.pending === "1";
  const showVarejoConfirmed =
    varejoOnline &&
    !order.stock_conflict &&
    (fromMpPaid || order.status === "PAGO");
  const showVarejoPending =
    varejoOnline &&
    !order.stock_conflict &&
    !showVarejoConfirmed &&
    (fromMpPending ||
      (order.status === "PENDENTE_PAGAMENTO" && order.checkout_channel === "VAREJO_MP"));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="text-stone-400 hover:text-stone-200">
          ← Catálogo
        </Link>
      </nav>

      <header className="mb-8 space-y-4 border-b border-white/[0.06] pb-6">
        <div>
          <p className="text-lg font-semibold uppercase tracking-wide text-stone-100">
            {`PEDIDO #${displayNumber}`}
          </p>
        </div>

        {order.customer_name?.trim() ? (
          <p className="text-sm text-stone-300">
            <span className="text-stone-500">Nome: </span>
            {order.customer_name.trim()}
          </p>
        ) : null}

        {order.customer_note?.trim() ? (
          <p className="text-sm text-stone-300">
            <span className="text-stone-500">CEP (frete): </span>
            {order.customer_note.trim()}
          </p>
        ) : null}

        {categoryTotals.length > 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-zinc-900/50 px-4 py-3 ring-1 ring-white/[0.03]">
            <ul className="space-y-1.5 text-sm font-medium italic text-stone-200">
              {categoryTotals.map(({ label, qty }) => (
                <li key={label}>
                  x{qty} {label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {order.stock_conflict ? (
          <StockConflictNotice conflict={order.stock_conflict} variant="client" />
        ) : showVarejoConfirmed ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/35 px-4 py-4 ring-1 ring-emerald-500/20">
            <p className="text-base font-semibold text-emerald-100">
              Pedido confirmado
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/90">
              Seu pedido está em preparação.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-100/80">
              Você receberá as atualizações no WhatsApp.
            </p>
          </div>
        ) : showVarejoPending ? (
          <div className="rounded-xl border border-amber-500/35 bg-amber-950/30 px-4 py-4 ring-1 ring-amber-500/15">
            <p className="text-base font-semibold text-amber-100">
              Pagamento em processamento
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
              Assim que o Mercado Pago confirmar, atualizamos o status aqui e avisamos
              você no WhatsApp.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-stone-400">
            O vendedor vai te passar o orçamento e finalizar seu pedido o quanto antes,
            aguarde só um momento!
          </p>
        )}

        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-sm text-stone-500">
            {statusLabel(order.status, { varejoConfirmed: showVarejoConfirmed })}
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {new Date(order.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="text-stone-500">Sem itens registados.</p>
      ) : (
        <div className="space-y-8">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Detalhe por produto
          </p>
          {SIZE_ORDER.map((size) => {
            const list = bySize.get(size) ?? [];
            if (!list.length) return null;
            return (
              <section key={size}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
                  Tamanho {size}
                </h2>
                <ul className="space-y-3">
                  {list.map((it) => (
                    <li
                      key={it.id}
                      className="flex gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/40 p-3 ring-1 ring-white/[0.03]"
                    >
                      <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-zinc-950">
                        <Image
                          src={itemImageSrc(it)}
                          alt=""
                          fill
                          unoptimized
                          className="object-cover"
                          sizes="72px"
                        />
                      </div>
                      <div className="min-w-0 flex-1 py-0.5">
                        <p className="font-medium text-stone-100">
                          {it.snapshot_brand}{" "}
                          <span className="text-stone-500">—</span>{" "}
                          {it.snapshot_color}
                        </p>
                        <p className="mt-1 text-sm text-stone-500">
                          Quantidade:{" "}
                          <span className="tabular-nums text-stone-300">
                            {it.quantity}
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-stone-600">
        Guarda esta página para consultar o seu pedido.{" "}
        <Link href="/" className="text-stone-400 hover:text-stone-200">
          Voltar ao catálogo
        </Link>
      </p>
    </div>
  );
}
