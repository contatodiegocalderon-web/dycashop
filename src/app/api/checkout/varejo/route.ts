import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeCartPricing,
  WHOLESALE_CART_MIN_PIECES,
} from "@/lib/cart-pricing";
import { getCategoryPricingBatch } from "@/lib/category-showcase";
import { fetchOrderDisplayNumberPublic } from "@/lib/order-display-number";
import { createCheckoutPreference } from "@/lib/mercadopago";
import { productPublicImageUrl } from "@/lib/product-image-url";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";
import { validateShippingAddress } from "@/lib/shipping-address";
import type { Product } from "@/types";

export const runtime = "nodejs";

const MAX_DISTINCT_PRODUCTS = 200;
const MAX_QTY_PER_LINE = 500;
const MAX_TOTAL_QTY = 200;
const MAX_NAME_LEN = 120;

type BodyItem = { productId: string; quantity: number };

type ShippingInput = {
  service?: string;
  code?: string;
  label?: string;
  price?: number;
};

function snapshotImageUrl(p: Product): string {
  return productPublicImageUrl(p);
}

function isLocalOrigin(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return true;
  }
}

/** URL pública para retorno/webhook MP — localhost é rejeitado pela API. */
function mercadoPagoSiteBase(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit && !isLocalOrigin(explicit)) return explicit;

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "";
  if (app && !isLocalOrigin(app)) return app;

  return "https://dycashop.vercel.app";
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rlMax = Math.min(
      200,
      Math.max(5, Number(process.env.ORDER_RATE_LIMIT_MAX ?? "30") || 30)
    );
    const rlWindow = Math.min(
      86_400_000,
      Math.max(60_000, Number(process.env.ORDER_RATE_LIMIT_WINDOW_MS ?? "") || 900_000)
    );
    if (
      !rateLimitAllow(`varejo-checkout:${ip}`, "varejo_checkout_post", {
        max: rlMax,
        windowMs: rlWindow,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas a partir desta rede. Aguarde alguns minutos e tente novamente.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rlWindow / 1000)) },
        }
      );
    }

    const body = (await request.json()) as {
      items?: BodyItem[];
      customerName?: string;
      customerWhatsApp?: string;
      shipping?: ShippingInput;
      shippingAddress?: unknown;
      subtotal?: number;
    };

    const items = body.items;
    if (!items?.length) {
      return NextResponse.json({ error: "items obrigatório" }, { status: 400 });
    }
    if (items.length > MAX_DISTINCT_PRODUCTS) {
      return NextResponse.json(
        { error: `No máximo ${MAX_DISTINCT_PRODUCTS} linhas por pedido.` },
        { status: 400 }
      );
    }

    const nameRaw = String(body.customerName ?? "").trim();
    if (!nameRaw) {
      return NextResponse.json(
        { error: "Informe o seu nome para concluir o pedido." },
        { status: 400 }
      );
    }
    if (nameRaw.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `Nome demasiado longo (máx. ${MAX_NAME_LEN} caracteres).` },
        { status: 400 }
      );
    }

    const rawCustomerWhatsappDigits = String(body.customerWhatsApp ?? "").replace(
      /\D/g,
      ""
    );
    const customerWhatsappDigits = rawCustomerWhatsappDigits
      ? rawCustomerWhatsappDigits.startsWith("55")
        ? rawCustomerWhatsappDigits
        : `55${rawCustomerWhatsappDigits}`
      : "";
    if (customerWhatsappDigits.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido (mínimo 10 dígitos, com DDD)." },
        { status: 400 }
      );
    }

    const shippingRaw = body.shipping;
    const shippingPrice = Number(shippingRaw?.price ?? NaN);
    const shippingService = String(
      shippingRaw?.service ?? shippingRaw?.code ?? ""
    ).trim();
    const shippingLabel = String(shippingRaw?.label ?? shippingService).trim();
    if (
      !shippingService ||
      !Number.isFinite(shippingPrice) ||
      shippingPrice < 0
    ) {
      return NextResponse.json(
        { error: "Selecione uma opção de frete válida." },
        { status: 400 }
      );
    }

    const addressResult = validateShippingAddress(body.shippingAddress);
    if (!addressResult.ok) {
      return NextResponse.json({ error: addressResult.error }, { status: 400 });
    }
    const shippingAddress = {
      ...addressResult.value,
      recipientName: nameRaw,
    };

    const admin = createAdminClient();
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const { data: products, error: pErr } = await admin
      .from("products")
      .select("*")
      .in("id", productIds);

    if (pErr || !products?.length) {
      return NextResponse.json(
        { error: pErr?.message ?? "Produtos não encontrados" },
        { status: 400 }
      );
    }

    const byId = new Map(products.map((p: Product) => [p.id, p]));
    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId || !Number.isFinite(it.quantity) || it.quantity < 1) {
        return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      }
      if (it.quantity > MAX_QTY_PER_LINE) {
        return NextResponse.json(
          { error: `Quantidade por linha demasiado alta (máx. ${MAX_QTY_PER_LINE}).` },
          { status: 400 }
        );
      }
      qtyByProduct.set(
        it.productId,
        (qtyByProduct.get(it.productId) ?? 0) + it.quantity
      );
    }

    const totalQtyOrdered = Array.from(qtyByProduct.values()).reduce(
      (a, b) => a + b,
      0
    );
    if (totalQtyOrdered >= WHOLESALE_CART_MIN_PIECES) {
      return NextResponse.json(
        {
          error:
            "Este checkout é apenas para varejo (menos de 5 peças). Para atacado, use o WhatsApp.",
        },
        { status: 400 }
      );
    }
    if (totalQtyOrdered > MAX_TOTAL_QTY) {
      return NextResponse.json(
        { error: `Total de peças por pedido demasiado alto (máx. ${MAX_TOTAL_QTY}).` },
        { status: 400 }
      );
    }

    for (const [pid, qty] of Array.from(qtyByProduct.entries())) {
      const p = byId.get(pid);
      if (!p) {
        return NextResponse.json(
          { error: `Produto ${pid} inexistente` },
          { status: 400 }
        );
      }
      if (p.status !== "ATIVO" || p.stock < qty) {
        return NextResponse.json(
          {
            error: `Estoque insuficiente para ${p.brand} ${p.color} (${p.size}). Disponível: ${p.stock}`,
          },
          { status: 400 }
        );
      }
    }

    const categoryLabels = Array.from(
      new Set(
        products
          .map((p: Product) => p.category?.trim())
          .filter((c): c is string => Boolean(c))
      )
    );
    const pricingByCategory = await getCategoryPricingBatch(categoryLabels);
    const tiersByCategory: Record<
      string,
      (typeof pricingByCategory)[string]["wholesaleTiers"]
    > = {};
    const retailByCategory: Record<string, number | null> = {};
    for (const [label, cfg] of Object.entries(pricingByCategory)) {
      tiersByCategory[label] = cfg.wholesaleTiers;
      retailByCategory[label] = cfg.retailPricePerPiece;
    }

    const cartLines = Array.from(qtyByProduct.entries()).map(
      ([productId, quantity]) => {
        const p = byId.get(productId)!;
        return {
          productId,
          driveFileId: p.drive_file_id,
          quantity,
          product: p,
        };
      }
    );
    const pricing = computeCartPricing(
      cartLines,
      tiersByCategory,
      retailByCategory
    );
    if (pricing.isWholesaleCart || pricing.subtotal == null) {
      return NextResponse.json(
        { error: "Não foi possível calcular o preço de varejo do carrinho." },
        { status: 400 }
      );
    }

    const clientSubtotal = Number(body.subtotal ?? NaN);
    if (
      !Number.isFinite(clientSubtotal) ||
      Math.abs(clientSubtotal - pricing.subtotal) > 0.02
    ) {
      return NextResponse.json(
        { error: "Subtotal desatualizado. Atualize o carrinho e tente novamente." },
        { status: 409 }
      );
    }

    const saleAmount = Number((pricing.subtotal + shippingPrice).toFixed(2));
    const publicToken = randomBytes(18).toString("hex");

    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        status: "PENDENTE_PAGAMENTO",
        customer_name: nameRaw,
        customer_whatsapp: customerWhatsappDigits,
        requested_seller_name: "SITE-VAREJO",
        requested_seller_phone: null,
        public_token: publicToken,
        sale_amount: saleAmount,
        shipping_address: shippingAddress,
        shipping_cost: Number(shippingPrice.toFixed(2)),
        shipping_service: shippingLabel || shippingService,
        checkout_channel: "VAREJO_MP",
        sales_channel: "VAREJO",
        customer_note: `CEP ${shippingAddress.cep} — ${shippingAddress.street}, ${shippingAddress.number}`,
      })
      .select("id, display_number")
      .single();

    if (oErr || !order) {
      const msg = oErr?.message ?? "Falha ao criar pedido";
      const hint =
        /shipping_address|checkout_channel|mp_preference_id/i.test(msg)
          ? "Execute o SQL em supabase/migration_varejo_checkout.sql no painel do Supabase."
          : undefined;
      return NextResponse.json(
        { error: msg, ...(hint ? { hint } : {}) },
        { status: 500 }
      );
    }

    const orderItems = Array.from(qtyByProduct.entries()).map(
      ([productId, quantity]) => {
        const p = byId.get(productId)!;
        const cat =
          p.category != null && String(p.category).trim() !== ""
            ? String(p.category).trim()
            : "Sem categoria";
        return {
          order_id: order.id,
          product_id: p.id,
          quantity,
          snapshot_image_url: snapshotImageUrl(p),
          snapshot_original_name: p.original_file_name,
          snapshot_brand: p.brand,
          snapshot_color: p.color,
          snapshot_size: p.size,
          snapshot_drive_file_id: p.drive_file_id,
          snapshot_category: cat,
        };
      }
    );

    const { error: iErr } = await admin.from("order_items").insert(orderItems);
    if (iErr) {
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }

    const dn = Number((order as { display_number?: unknown }).display_number);
    const orderDisplayNumber =
      Number.isFinite(dn) && dn > 0
        ? dn
        : await fetchOrderDisplayNumberPublic(order.id);

    const siteBase = mercadoPagoSiteBase();
    if (!siteBase) {
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        {
          error:
            "Configure NEXT_PUBLIC_SITE_URL ou NEXT_PUBLIC_APP_URL para checkout Mercado Pago.",
        },
        { status: 500 }
      );
    }

    const mpItems = cartLines.map(({ product, quantity }) => {
      const linePricing = pricing.lines.find(
        (l) => l.productId === product.id
      );
      const unitPrice = linePricing?.unitPrice ?? 0;
      return {
        title: `${product.brand} ${product.color} (${product.size})`.slice(
          0,
          256
        ),
        quantity,
        unitPrice,
      };
    });

    let preference;
    try {
      preference = await createCheckoutPreference({
        orderId: order.id,
        displayNumber: orderDisplayNumber,
        items: mpItems,
        shippingPrice,
        shippingLabel: shippingLabel || shippingService,
        payerName: nameRaw,
        payerPhone: customerWhatsappDigits,
        payerCpf: shippingAddress.cpf,
        backUrls: {
          success: `${siteBase}/recibo/${publicToken}?paid=1`,
          failure: `${siteBase}/carrinho?mp=failure`,
          pending: `${siteBase}/recibo/${publicToken}?pending=1`,
        },
        notificationUrl: `${siteBase}/api/mercadopago/webhook`,
      });
    } catch (mpErr) {
      await admin.from("orders").delete().eq("id", order.id);
      const msg =
        mpErr instanceof Error
          ? mpErr.message
          : "Falha ao iniciar pagamento Mercado Pago.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const { error: prefErr } = await admin
      .from("orders")
      .update({ mp_preference_id: preference.id })
      .eq("id", order.id);
    if (prefErr) {
      console.error("[varejo-checkout] mp_preference_id:", prefErr.message);
    }

    return NextResponse.json({
      initPoint: preference.initPoint,
      orderId: order.id,
      orderDisplayNumber,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
