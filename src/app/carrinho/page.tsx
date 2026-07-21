"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCatalogReturnUrl, markCatalogBrowseRestore } from "@/lib/catalog-return-url";
import { CART_STORAGE_KEY, useCart } from "@/providers/cart-provider";
import type { CartLine, ProductSize } from "@/types";
import type { WhatsAppSeller } from "@/lib/sellers";
import { WHATSAPP_SELLERS } from "@/lib/sellers";
import { normalizeCheckoutWaDigits } from "@/lib/abandoned-checkout";
import { buildOrderWhatsAppText, waMeUrl } from "@/lib/whatsapp";
import { CartShippingQuote } from "@/components/cart-shipping-quote";
import type { ShippingQuotePayload, ShippingQuoteOption } from "@/lib/shipping-quote-types";
import { totalsByCategoryFromCartLines } from "@/lib/order-category-totals";
import {
  isRetailPieceCount,
  RETAIL_MAX_PIECES,
  WHOLESALE_MIN_PIECES,
} from "@/lib/sales-channel";

type CheckoutStep = "cart" | "entrega";

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

function orderSummaryText(lines: CartLine[]): string {
  return totalsByCategoryFromCartLines(lines)
    .map(({ label, qty }) => `${qty}x ${label.toUpperCase()}`)
    .join(" ");
}

function CheckoutStepper({
  active,
  isRetail,
}: {
  active: "carrinho" | "entrega" | "pagamento";
  isRetail: boolean;
}) {
  const steps: Array<{
    id: "carrinho" | "entrega" | "pagamento";
    label: string;
  }> = [
    { id: "carrinho", label: "Carrinho" },
    { id: "entrega", label: "Entrega" },
    { id: "pagamento", label: isRetail ? "Pagamento" : "WhatsApp" },
  ];
  const order = ["carrinho", "entrega", "pagamento"] as const;
  const activeIdx = order.indexOf(active);

  return (
    <nav aria-label="Etapas do checkout" className="mb-8">
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          return (
            <li key={step.id} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-center">
                {i > 0 ? (
                  <span
                    className={`h-px flex-1 ${done || current ? "bg-white/40" : "bg-white/10"}`}
                    aria-hidden
                  />
                ) : (
                  <span className="flex-1" aria-hidden />
                )}
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-white text-zinc-950"
                      : current
                        ? "bg-white text-zinc-950 ring-2 ring-white/30"
                        : "bg-zinc-800 text-stone-500"
                  }`}
                  aria-current={current ? "step" : undefined}
                >
                  {done ? "✓" : i + 1}
                </span>
                {i < steps.length - 1 ? (
                  <span
                    className={`h-px flex-1 ${done ? "bg-white/40" : "bg-white/10"}`}
                    aria-hidden
                  />
                ) : (
                  <span className="flex-1" aria-hidden />
                )}
              </div>
              <span
                className={`text-[11px] font-medium uppercase tracking-wide ${
                  current || done ? "text-stone-200" : "text-stone-600"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function groupBySize(lines: CartLine[]) {
  const m = new Map<ProductSize, CartLine[]>();
  for (const s of SIZE_ORDER) m.set(s, []);
  for (const line of lines) {
    m.get(line.product.size)?.push(line);
  }
  return m;
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={40}
      height={40}
      className={className}
      aria-hidden
    >
      <path
        fill="#ffffff"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function WhatsAppBadgeTiny() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      className="block"
      aria-hidden
    >
      <path
        fill="#ffffff"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function SellerChoiceAvatar({ seller }: { seller: WhatsAppSeller }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = seller.photoUrl?.trim();
  const showPhoto = Boolean(src) && !imgFailed;
  const initial = seller.name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="relative h-14 w-14 shrink-0">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL dinâmica em public/
        <img
          src={src}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-full object-cover ring-2 ring-white/25"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#25D366] to-[#075e54] text-xl font-bold text-white ring-2 ring-white/25"
          aria-hidden
        >
          {initial}
        </div>
      )}
      <div
        className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366] shadow-md ring-2 ring-zinc-900"
        title="WhatsApp"
      >
        <WhatsAppBadgeTiny />
      </div>
    </div>
  );
}

export default function CarrinhoPage() {
  const router = useRouter();
  const { lines, hydrated, setLineQuantity, removeLine, clear, reconcileWithCatalog } =
    useCart();
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsApp, setCustomerWhatsApp] = useState("+55 ");
  const [cep, setCep] = useState("");
  const [shippingQuote, setShippingQuote] = useState<ShippingQuotePayload | null>(
    null
  );
  const [selectedShipping, setSelectedShipping] =
    useState<ShippingQuoteOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [selectedSellerPhone, setSelectedSellerPhone] = useState<string | null>(
    WHATSAPP_SELLERS[0]?.phone ?? null
  );
  const [portalReady, setPortalReady] = useState(false);
  const lastTouchRef = useRef(0);
  const initialReconcileDoneRef = useRef(false);
  /** Evita sobrescrever o nome depois de o cliente editar manualmente (ref lida no fim do debounce). */
  const nameManuallyEditedRef = useRef(false);

  const groups = useMemo(() => groupBySize(lines), [lines]);
  const totalPieces = useMemo(
    () => lines.reduce((s, l) => s + Math.max(0, Number(l.quantity) || 0), 0),
    [lines]
  );
  const isRetailCheckout = isRetailPieceCount(totalPieces);
  const categorySummary = useMemo(() => orderSummaryText(lines), [lines]);

  const deliveryFormReady = useMemo(() => {
    const waOk = normalizeCheckoutWaDigits(customerWhatsApp).length >= 10;
    const nameOk = customerName.trim().length > 0;
    const cepOk = cep.replace(/\D/g, "").length === 8;
    const shipOk = Boolean(selectedShipping && Number(selectedShipping.price) >= 0);
    return waOk && nameOk && cepOk && shipOk;
  }, [customerWhatsApp, customerName, cep, selectedShipping]);

  const goBackToCatalog = useCallback(() => {
    markCatalogBrowseRestore();
    router.push(getCatalogReturnUrl());
  }, [router]);

  useEffect(() => {
    if (!lines.length) setCheckoutStep("cart");
  }, [lines.length]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("mp") === "falhou") {
      setErr("Pagamento não concluído. Pode tentar de novo ou escolher outra forma.");
    }
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (!lines.length) {
      setReconciling(false);
      return;
    }
    if (initialReconcileDoneRef.current) return;
    initialReconcileDoneRef.current = true;

    let cancelled = false;
    setReconciling(true);
    void reconcileWithCatalog()
      .then((notice) => {
        if (!cancelled) setCartNotice(notice);
      })
      .catch(() => {
        /* rede — o envio volta a reconciliar */
      })
      .finally(() => {
        if (!cancelled) setReconciling(false);
      });
    return () => {
      cancelled = true;
      setReconciling(false);
    };
  }, [hydrated, lines.length, reconcileWithCatalog]);

  useEffect(() => {
    const digits = normalizeCheckoutWaDigits(customerWhatsApp);
    if (digits.length < 10) return;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(
            `/api/orders/lookup-customer-name?whatsapp=${encodeURIComponent(digits)}`,
            { signal: ac.signal }
          );
          if (!r.ok) return;
          const j = (await r.json()) as { customerName?: string | null };
          const n = j.customerName?.trim();
          if (n && !nameManuallyEditedRef.current) {
            setCustomerName(n);
          }
        } catch {
          /* abort / rede */
        }
      })();
    }, 450);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [customerWhatsApp]);

  const openSellerModal = useCallback(() => {
    setErr(null);
    if (!lines.length) return;
    const pieces = lines.reduce(
      (s, l) => s + Math.max(0, Number(l.quantity) || 0),
      0
    );
    if (isRetailPieceCount(pieces)) {
      setErr(
        `Com até ${RETAIL_MAX_PIECES} peças use «Iniciar Compra - VAREJO». WhatsApp é para ${WHOLESALE_MIN_PIECES}+.`
      );
      return;
    }
    const waDigits = normalizeCheckoutWaDigits(customerWhatsApp);
    if (waDigits.length < 10) {
      setErr("Informe um WhatsApp válido (com DDD, mínimo 10 dígitos).");
      return;
    }
    if (!customerName.trim()) {
      setErr("Informe o seu nome para enviar o pedido.");
      return;
    }
    if (!WHATSAPP_SELLERS.length) {
      setErr("Nenhum vendedor configurado.");
      return;
    }
    setSelectedSellerPhone((prev) => {
      if (prev && WHATSAPP_SELLERS.some((s) => s.phone === prev)) return prev;
      return WHATSAPP_SELLERS[0]!.phone;
    });
    setSellerModalOpen(true);
  }, [lines, customerWhatsApp, customerName]);

  const closeSellerModal = useCallback(() => {
    if (!busy) setSellerModalOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!sellerModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSellerModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sellerModalOpen, closeSellerModal]);

  async function submitOrderToSeller(sellerPhone: string) {
    const phone = sellerPhone.replace(/\D/g, "");
    if (!phone.length) {
      setErr("Telefone do vendedor inválido.");
      return;
    }
    if (!lines.length) return;
    if (isRetailPieceCount(totalPieces)) {
      setErr(
        `Com ${totalPieces} peça(s) use «Iniciar Compra - VAREJO» (Mercado Pago). Atacado é a partir de ${WHOLESALE_MIN_PIECES} peças.`
      );
      return;
    }
    const waDigits = normalizeCheckoutWaDigits(customerWhatsApp);
    if (waDigits.length < 10) {
      setErr("Informe um WhatsApp válido (com DDD).");
      return;
    }
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setErr("Informe o seu nome para enviar o pedido.");
      return;
    }

    setBusy(true);
    setErr(null);
    setCartNotice(null);
    try {
      const staleNotice = await reconcileWithCatalog();
      if (staleNotice) {
        setCartNotice(staleNotice);
        throw new Error(
          "O carrinho mudou: algumas peças já não estão disponíveis. Revise e tente outra vez."
        );
      }

      const seller = WHATSAPP_SELLERS.find((s) => s.phone === sellerPhone) ?? null;
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          customerNote: cep.trim() || undefined,
          customerName: trimmedName,
          customerWhatsApp: customerWhatsApp.trim(),
          sellerName: seller?.name ?? undefined,
          sellerPhone: seller?.phone ?? undefined,
        }),
      });

      const rawText = await res.text();
      let data: {
        error?: string;
        publicToken?: string;
        orderDisplayNumber?: number;
        receiptUrl?: string | null;
      } = {};
      try {
        data = rawText ? (JSON.parse(rawText) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }

      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao criar pedido");
      }

      const publicToken = data.publicToken;
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const receiptUrl =
        (data.receiptUrl?.trim() ||
          (publicToken ? `${origin}/recibo/${publicToken}` : "")) ||
        "";

      const text = buildOrderWhatsAppText(lines, {
        receiptUrl: receiptUrl || undefined,
        customerCep: cep,
        customerName: trimmedName,
        shippingQuote,
        selectedShipping,
        orderDisplayNumber:
          typeof data.orderDisplayNumber === "number"
            ? data.orderDisplayNumber
            : undefined,
      });
      const url = waMeUrl(phone, text);
      clear();
      try {
        localStorage.removeItem(CART_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      nameManuallyEditedRef.current = false;
      setCustomerName("");
      setCustomerWhatsApp("+55 ");
      setCep("");
      setShippingQuote(null);
      setSelectedShipping(null);
      setSellerModalOpen(false);
      window.location.assign(url);
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Falha de rede ou do servidor."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitRetailMercadoPago() {
    if (!lines.length) return;
    setErr(null);
    setCartNotice(null);

    if (!isRetailPieceCount(totalPieces)) {
      setErr(
        `Pagamento online é para 1–${RETAIL_MAX_PIECES} peças. Com ${totalPieces} use WhatsApp.`
      );
      return;
    }
    const waDigits = normalizeCheckoutWaDigits(customerWhatsApp);
    if (waDigits.length < 10) {
      setErr("Informe um WhatsApp válido (com DDD).");
      return;
    }
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setErr("Informe o seu nome.");
      return;
    }
    const cepDigits = cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) {
      setErr("Informe um CEP válido.");
      return;
    }
    if (!selectedShipping || !(Number(selectedShipping.price) >= 0)) {
      setErr("Calcule o frete e selecione PAC ou SEDEX.");
      return;
    }

    setBusy(true);
    try {
      const staleNotice = await reconcileWithCatalog();
      if (staleNotice) {
        setCartNotice(staleNotice);
        throw new Error(
          "O carrinho mudou: algumas peças já não estão disponíveis. Revise e tente outra vez."
        );
      }

      const res = await fetch("/api/payments/mercadopago/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          customerName: trimmedName,
          customerWhatsApp: customerWhatsApp.trim(),
          cep: cepDigits,
          shipping: {
            service: selectedShipping.code,
            label: selectedShipping.label,
            price: selectedShipping.price,
            deadlineDays: selectedShipping.deliveryDays ?? null,
          },
        }),
      });

      const rawText = await res.text();
      let data: {
        error?: string;
        hint?: string;
        initPoint?: string;
      } = {};
      try {
        data = rawText ? (JSON.parse(rawText) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) {
        throw new Error(
          [data.error, data.hint].filter(Boolean).join(" — ") ||
            "Falha ao iniciar pagamento"
        );
      }
      if (!data.initPoint) {
        throw new Error("Link de pagamento não recebido.");
      }

      clear();
      try {
        localStorage.removeItem(CART_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      window.location.assign(data.initPoint);
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Falha de rede ou do servidor."
      );
    } finally {
      setBusy(false);
    }
  }

  function touchAdjustQuantity(productId: string, nextQty: number) {
    lastTouchRef.current = Date.now();
    setLineQuantity(productId, nextQty);
  }

  function clickAdjustQuantity(productId: string, nextQty: number) {
    // Evita clique fantasma após touch em alguns browsers mobile.
    if (Date.now() - lastTouchRef.current < 450) return;
    setLineQuantity(productId, nextQty);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {checkoutStep === "entrega" && lines.length > 0 ? (
        <CheckoutStepper
          active="entrega"
          isRetail={isRetailCheckout}
        />
      ) : (
        <>
          <h1 className="text-xl font-bold text-stone-100">Carrinho</h1>
          <p className="mt-1 text-sm text-stone-400">
            Confira as peças e inicie a compra quando estiver pronto.
          </p>
        </>
      )}

      {cartNotice && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {cartNotice}
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {portalReady && sellerModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/75 p-4 sm:items-center"
              style={{ touchAction: "manipulation" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="seller-modal-title"
              onClick={closeSellerModal}
            >
              <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-white/10 bg-[#075e54] px-5 py-4 text-white">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#128c7e]">
                      <WhatsAppGlyph />
                    </div>
                    <div className="min-w-0">
                      <p
                        id="seller-modal-title"
                        className="text-base font-semibold leading-tight"
                      >
                        Enviar pedido no WhatsApp
                      </p>
                      <p className="mt-1 text-xs text-white/85">
                        Veja a foto e o ícone do WhatsApp — depois toque em Enviar pedido
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[min(52vh,360px)] overflow-y-auto overscroll-contain px-4 py-4">
                  <ul className="space-y-2">
                    {WHATSAPP_SELLERS.map((s) => {
                      const checked = selectedSellerPhone === s.phone;
                      return (
                        <li key={s.phone}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            aria-label={`Enviar para ${s.name} no WhatsApp`}
                            onClick={() => setSelectedSellerPhone(s.phone)}
                            className={`flex w-full min-h-[60px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:opacity-90 ${
                              checked
                                ? "border-emerald-400/70 bg-emerald-950/50 ring-1 ring-emerald-500/30"
                                : "border-white/12 bg-zinc-950/60 hover:border-white/25"
                            } `}
                          >
                            <SellerChoiceAvatar seller={s} />
                            <span className="min-w-0 flex-1 text-base font-medium text-stone-100">
                              {s.name}
                            </span>
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                                checked
                                  ? "border-emerald-400 bg-emerald-500"
                                  : "border-stone-500 bg-transparent"
                              }`}
                              aria-hidden
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 border-t border-white/10 bg-zinc-950 px-4 py-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={closeSellerModal}
                    className="order-2 min-h-[48px] rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-stone-200 hover:bg-white/10 disabled:opacity-50 sm:order-1"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy || !selectedSellerPhone || !WHATSAPP_SELLERS.length
                    }
                    onClick={() => {
                      if (selectedSellerPhone) {
                        void submitOrderToSeller(selectedSellerPhone);
                      }
                    }}
                    className="order-1 min-h-[48px] rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:order-2"
                  >
                    {busy ? "A enviar…" : "Enviar pedido"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {lines.length === 0 ? (
        <p className="mt-8 text-stone-400">
          Carrinho vazio.{" "}
          <button
            type="button"
            onClick={goBackToCatalog}
            className="font-medium text-stone-400 transition-colors hover:text-stone-200"
          >
            Voltar
          </button>
        </p>
      ) : checkoutStep === "cart" ? (
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
                        <Image
                          src={line.product.drive_image_url}
                          alt=""
                          fill
                          unoptimized
                          className="object-cover"
                          sizes="52px"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-100">
                          {line.product.brand} — {line.product.color}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-stone-400">Qtd</span>
                          <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-zinc-600 bg-zinc-950 touch-manipulation">
                            <button
                              type="button"
                              aria-label="Diminuir quantidade"
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-lg font-semibold text-stone-100 active:bg-zinc-800 disabled:opacity-40"
                              disabled={busy}
                              onTouchStart={(e) => {
                                e.preventDefault();
                                touchAdjustQuantity(
                                  line.productId,
                                  line.quantity - 1
                                );
                              }}
                              onClick={() =>
                                clickAdjustQuantity(
                                  line.productId,
                                  line.quantity - 1
                                )
                              }
                            >
                              −
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              aria-label="Quantidade"
                              value={line.quantity}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, "");
                                if (raw === "") return;
                                const n = Number.parseInt(raw, 10);
                                if (!Number.isFinite(n)) return;
                                setLineQuantity(line.productId, n);
                              }}
                              className="w-12 border-x border-zinc-600 bg-zinc-950 py-2 text-center text-sm tabular-nums text-stone-100 outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600/40"
                            />
                            <button
                              type="button"
                              aria-label="Aumentar quantidade"
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-lg font-semibold text-stone-100 active:bg-zinc-800 disabled:opacity-40"
                              disabled={
                                busy || line.quantity >= line.product.stock
                              }
                              onTouchStart={(e) => {
                                e.preventDefault();
                                touchAdjustQuantity(
                                  line.productId,
                                  line.quantity + 1
                                );
                              }}
                              onClick={() =>
                                clickAdjustQuantity(
                                  line.productId,
                                  line.quantity + 1
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                          <span className="text-xs text-stone-500">
                            máx. {line.product.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(line.productId)}
                            className="text-xs font-medium text-red-400 hover:underline"
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

          {categorySummary ? (
            <div className="border-t border-white/10 pt-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Resumo do pedido
              </p>
              <p className="mt-2 text-sm font-semibold leading-relaxed tracking-wide text-stone-100">
                {categorySummary}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {totalPieces} peça{totalPieces === 1 ? "" : "s"} no total
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {isRetailCheckout ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] uppercase tracking-wide text-stone-500">
                  ATACADO a partir de {WHOLESALE_MIN_PIECES} peças
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setErr(null);
                    setCheckoutStep("entrega");
                  }}
                  className="rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Iniciar Compra - VAREJO
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setErr(null);
                  setCheckoutStep("entrega");
                }}
                className="rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Iniciar Compra - ATACADO
              </button>
            )}
            <button
              type="button"
              onClick={goBackToCatalog}
              className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-stone-300 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
            >
              Continuar comprando
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-8">
          <div>
            <h1 className="text-xl font-bold text-stone-100">Entrega</h1>
            <p className="mt-1 text-sm text-stone-400">
              {isRetailCheckout
                ? "Preencha os dados e continue para o pagamento online."
                : "Preencha os dados e envie o pedido no WhatsApp."}
            </p>
            {categorySummary ? (
              <p className="mt-3 text-xs font-medium leading-relaxed text-stone-400">
                {categorySummary}
              </p>
            ) : null}
          </div>

          <section className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Dados de contato
              </p>
              <div className="mt-3 max-w-md space-y-4">
                <div>
                  <label
                    htmlFor="checkout-customer-whatsapp"
                    className="text-sm font-medium text-stone-300"
                  >
                    WhatsApp <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="checkout-customer-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={customerWhatsApp}
                    onChange={(e) => {
                      nameManuallyEditedRef.current = false;
                      const digits = e.target.value.replace(/\D/g, "");
                      const brDigits = digits.startsWith("55")
                        ? digits
                        : `55${digits}`;
                      const national = brDigits.slice(2, 13);
                      const ddd = national.slice(0, 2);
                      const first = national.slice(2, 7);
                      const second = national.slice(7, 11);
                      const formatted = `+55 ${ddd}${first ? ` ${first}` : ""}${second ? `-${second}` : ""}`;
                      setCustomerWhatsApp(formatted.trimEnd());
                    }}
                    maxLength={20}
                    className="mt-2 w-full rounded-none border border-white/25 bg-transparent px-3 py-3 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-white/50"
                    placeholder="+55 11 99999-9999"
                  />
                </div>
                <div>
                  <label
                    htmlFor="checkout-customer-name"
                    className="text-sm font-medium text-stone-300"
                  >
                    Nome <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="checkout-customer-name"
                    type="text"
                    autoComplete="name"
                    value={customerName}
                    onChange={(e) => {
                      nameManuallyEditedRef.current = true;
                      setCustomerName(e.target.value);
                    }}
                    maxLength={120}
                    className="mt-2 w-full rounded-none border border-white/25 bg-transparent px-3 py-3 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-white/50"
                    placeholder="Seu nome"
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Entrega
              </p>
              <div className="mt-3 max-w-md">
                <label
                  htmlFor="checkout-cep"
                  className="text-sm font-medium text-stone-300"
                >
                  CEP <span className="text-red-400">*</span>
                </label>
                <input
                  id="checkout-cep"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  maxLength={9}
                  className="mt-2 w-full rounded-none border border-white/25 bg-transparent px-3 py-3 text-sm tabular-nums text-stone-100 outline-none placeholder:text-stone-600 focus:border-white/50"
                  placeholder="00000-000"
                />
                <CartShippingQuote
                  lines={lines}
                  cep={cep}
                  onQuoteChange={setShippingQuote}
                  onSelectionChange={setSelectedShipping}
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 pt-2">
            {isRetailCheckout ? (
              <button
                type="button"
                disabled={busy || !deliveryFormReady}
                onClick={() => void submitRetailMercadoPago()}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                {busy ? "A abrir pagamento…" : "Continuar"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !deliveryFormReady}
                onClick={openSellerModal}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                Enviar Pedido
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setErr(null);
                setCheckoutStep("cart");
              }}
              className="w-full rounded-xl border border-white/20 px-5 py-3 text-sm font-medium text-stone-300 hover:bg-white/[0.04] disabled:opacity-50"
            >
              Voltar ao carrinho
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
