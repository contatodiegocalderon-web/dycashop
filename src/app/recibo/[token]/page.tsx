import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderReceiptByToken, isValidReceiptToken } from "@/lib/order-receipt";
import { publicDriveImageUrl } from "@/lib/drive-image-url";
import type { OrderItemRow, OrderStatus, ProductSize } from "@/types";

type Props = { params: { token: string } };

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
  const u = it.snapshot_image_url?.trim() ?? "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return publicDriveImageUrl(it.snapshot_drive_file_id, 320);
}

function statusLabel(s: OrderStatus): string {
  switch (s) {
    case "PENDENTE_PAGAMENTO":
      return "Aguardando confirmação do vendedor";
    case "PAGO":
      return "Pagamento confirmado";
    case "CANCELADO":
      return "Pedido cancelado";
    default:
      return s;
  }
}

export default async function ReciboPage({ params }: Props) {
  const token = params.token;
  if (!isValidReceiptToken(token)) notFound();

  const receipt = await getOrderReceiptByToken(token);
  if (!receipt) notFound();

  const { order, items } = receipt;
  const bySize = groupItems(items);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="text-stone-400 hover:text-stone-200">
          ← Catálogo
        </Link>
      </nav>

      <header className="mb-8 border-b border-white/[0.06] pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">
          Recibo do pedido
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-stone-50">
          Resumo da sua seleção
        </h1>
        <p className="mt-2 text-sm text-stone-500">{statusLabel(order.status)}</p>
        <p className="mt-1 text-xs text-stone-600">
          {new Date(order.created_at).toLocaleString("pt-BR")}
        </p>
        {order.customer_note?.trim() ? (
          <p className="mt-3 text-sm text-stone-400">
            <span className="text-stone-600">CEP: </span>
            {order.customer_note}
          </p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="text-stone-500">Sem itens registados.</p>
      ) : (
        <div className="space-y-8">
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
                        <img
                          src={itemImageSrc(it)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
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
