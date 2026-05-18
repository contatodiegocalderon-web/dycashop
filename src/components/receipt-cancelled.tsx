import Link from "next/link";

export function ReceiptCancelledMessage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <nav className="mb-8 text-sm text-stone-500">
        <Link href="/" className="text-stone-400 hover:text-stone-200">
          ← Catálogo
        </Link>
      </nav>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-950/30 px-6 py-8 text-center ring-1 ring-amber-500/15">
        <p className="text-lg font-semibold leading-relaxed text-amber-100">
          Este pedido foi cancelado. Refaça a seleção e envie de novo.
        </p>
        <Link
          href="/carrinho"
          className="mt-6 inline-flex rounded-xl bg-stone-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
        >
          Ir ao carrinho
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-stone-600">
        <Link href="/" className="text-stone-400 hover:text-stone-200">
          Voltar ao catálogo
        </Link>
      </p>
    </div>
  );
}
