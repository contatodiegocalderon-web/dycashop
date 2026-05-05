"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/providers/cart-provider";
import type { CartLine, ProductSize } from "@/types";
import { buildOrderWhatsAppText, waMeUrl } from "@/lib/whatsapp";

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

function groupBySize(lines: CartLine[]) {
  const m = new Map<ProductSize, CartLine[]>();
  for (const s of SIZE_ORDER) m.set(s, []);
  for (const line of lines) {
    m.get(line.product.size)?.push(line);
  }
  return m;
}

export default function CarrinhoPage() {
  const { lines, setLineQuantity, removeLine, clear } = useCart();
  const [cep, setCep] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const phone = process.env.NEXT_PUBLIC_WHATSAPP_SELLER_NUMBER ?? "";

  const groups = useMemo(() => groupBySize(lines), [lines]);

  async function finalize() {
    setErr(null);
    if (!phone.replace(/\D/g, "").length) {
      setErr("Configure NEXT_PUBLIC_WHATSAPP_SELLER_NUMBER no .env");
      return;
    }
    if (!lines.length) return;

    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          customerNote: cep.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar pedido");

      const publicToken = data.publicToken as string | undefined;
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const receiptUrl =
        (data.receiptUrl as string | null | undefined)?.trim() ||
        (publicToken ? `${origin}/recibo/${publicToken}` : "");

      const text = buildOrderWhatsAppText(lines, {
        receiptUrl: receiptUrl || undefined,
        customerCep: cep,
      });
      const url = waMeUrl(phone, text);
      clear();
      setCep("");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-stone-100">Carrinho</h1>
      <p className="mt-1 text-sm text-stone-400">
        Confira por tamanho, informe o CEP e envie o pedido no WhatsApp.
      </p>

      {err && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {lines.length === 0 ? (
        <p className="mt-8 text-stone-400">
          Carrinho vazio.{" "}
          <Link
            href="/"
            className="font-medium text-stone-400 transition-colors hover:text-stone-200"
          >
            Voltar ao catálogo
          </Link>
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {SIZE_ORDER.map((size) => {
            const g = groups.get(size) ?? [];
            if (!g.length) return null;
            return (
              <section
                key={size}
                className="rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-4 shadow-sm ring-1 ring-white/[0.03]"
              >
                <h2 className="mb-4 text-lg font-semibold text-stone-100">
                  Tamanho {size}
                </h2>
                <ul className="space-y-4">
                  {g.map((line) => (
                    <li
                      key={line.productId}
                      className="flex gap-3 border-b border-white/[0.06] pb-4 last:border-0 last:pb-0"
                    >
                      <div className="relative h-[4.5rem] w-[3.25rem] shrink-0 overflow-hidden rounded-md bg-zinc-950">
                        <img
                          src={line.product.drive_image_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-100">
                          {line.product.category && (
                            <span className="mr-1 text-xs font-normal text-stone-500">
                              [{line.product.category}]{" "}
                            </span>
                          )}
                          {line.product.brand} — {line.product.color}
                        </p>
                        <p className="text-xs text-stone-400">SKU {line.product.sku}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="text-xs text-stone-400">
                            Qtd
                            <input
                              type="number"
                              min={1}
                              max={line.product.stock}
                              value={line.quantity}
                              onChange={(e) =>
                                setLineQuantity(
                                  line.productId,
                                  Number.parseInt(e.target.value, 10) || 1
                                )
                              }
                              className="ml-1 w-16 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-sm text-stone-100"
                            />
                          </label>
                          <span className="text-xs text-stone-500">
                            máx. {line.product.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(line.productId)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div>
            <label
              htmlFor="checkout-cep"
              className="text-sm font-medium text-stone-300"
            >
              CEP para frete
            </label>
            <p className="mt-0.5 text-xs text-stone-500">
              O vendedor usa o CEP para calcular o envio e responder no WhatsApp.
            </p>
            <input
              id="checkout-cep"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              maxLength={9}
              className="mt-2 w-full max-w-xs rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm tabular-nums text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
              placeholder="00000-000"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={finalize}
              className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {busy ? "Abrindo…" : "Enviar pedido no WhatsApp"}
            </button>
            <Link
              href="/"
              className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-stone-300 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
            >
              Continuar comprando
            </Link>
          </div>

          <p className="mt-10 text-center text-xs text-stone-600">
            <Link
              href="/"
              className="font-medium text-stone-400 transition-colors hover:text-stone-200"
            >
              Voltar às categorias
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
