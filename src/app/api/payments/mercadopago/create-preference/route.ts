import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productPublicImageUrl } from "@/lib/product-image-url";
import { sanitizeRetailPrice } from "@/lib/category-showcase";
import { isRetailPieceCount, RETAIL_MAX_PIECES } from "@/lib/sales-channel";
import {
  appPublicBaseUrl,
  createPreferenceClient,
  formatMercadoPagoError,
  isMercadoPagoPublicHttpsUrl,
} from "@/lib/mercadopago";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";
import type { Product } from "@/types";

export const runtime = "nodejs";

type BodyItem = { productId: string; quantity: number };

type ShippingBody = {
  service?: string;
  price?: number;
  deadlineDays?: number | null;
  label?: string;
};

/**
 * POST /api/payments/mercadopago/create-preference
 * Cria pedido VAREJO (1–4 peças) + preferência Checkout Pro.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (
      !rateLimitAllow(`mp-pref:${ip}`, "mp_preference", {
        max: 20,
        windowMs: 900_000,
      })
    ) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde e tente de novo." },
        { status: 429 }
      );
    }

    if (!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
      return NextResponse.json(
        {
          error:
            "Mercado Pago ainda não configurado (MERCADOPAGO_ACCESS_TOKEN).",
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      items?: BodyItem[];
      customerName?: string;
      customerWhatsApp?: string;
      cep?: string;
      shipping?: ShippingBody | null;
    };

    const customerName = String(body.customerName ?? "").trim();
    if (!customerName) {
      return NextResponse.json(
        { error: "Informe o nome" },
        { status: 400 }
      );
    }

    const rawWa = String(body.customerWhatsApp ?? "").replace(/\D/g, "");
    const customerWhatsapp = rawWa
      ? rawWa.startsWith("55")
        ? rawWa
        : `55${rawWa}`
      : "";
    if (customerWhatsapp.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido" },
        { status: 400 }
      );
    }

    const cepDigits = String(body.cep ?? "").replace(/\D/g, "");
    if (cepDigits.length !== 8) {
      return NextResponse.json(
        { error: "Informe um CEP válido para calcular o frete" },
        { status: 400 }
      );
    }

    const shippingPrice = Number(body.shipping?.price ?? NaN);
    if (!Number.isFinite(shippingPrice) || shippingPrice < 0) {
      return NextResponse.json(
        { error: "Selecione uma opção de frete (PAC ou SEDEX)" },
        { status: 400 }
      );
    }

    const items = body.items;
    if (!items?.length) {
      return NextResponse.json({ error: "items obrigatório" }, { status: 400 });
    }

    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId || !Number.isFinite(it.quantity) || it.quantity < 1) {
        return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      }
      qtyByProduct.set(
        it.productId,
        (qtyByProduct.get(it.productId) ?? 0) + Math.floor(it.quantity)
      );
    }

    let totalPieces = 0;
    for (const q of Array.from(qtyByProduct.values())) totalPieces += q;
    if (!isRetailPieceCount(totalPieces)) {
      return NextResponse.json(
        {
          error: `Checkout online é só para 1 a ${RETAIL_MAX_PIECES} peças. Com ${totalPieces} peças use o WhatsApp (atacado).`,
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const productIds = Array.from(qtyByProduct.keys());
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
    const qtyByCategory = new Map<string, number>();

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
      const cat =
        p.category != null && String(p.category).trim() !== ""
          ? String(p.category).trim()
          : "Sem categoria";
      qtyByCategory.set(cat, (qtyByCategory.get(cat) ?? 0) + qty);
    }

    const categories = Array.from(qtyByCategory.keys());
    const { data: showcaseRows, error: sErr } = await admin
      .from("category_showcase_settings")
      .select("category_label, retail_price")
      .in("category_label", categories);

    if (sErr) {
      const hint = /retail_price/i.test(sErr.message)
        ? "Execute supabase/migration_category_retail_price.sql no Supabase."
        : undefined;
      return NextResponse.json(
        { error: sErr.message, ...(hint ? { hint } : {}) },
        { status: 500 }
      );
    }

    const retailByCat = new Map<string, number>();
    for (const row of showcaseRows ?? []) {
      const label = String(row.category_label ?? "").trim();
      const price = sanitizeRetailPrice(row.retail_price);
      if (label && price != null && price > 0) retailByCat.set(label, price);
    }

    // Match case-insensitive if exact missing
    if (retailByCat.size < categories.length) {
      const { data: allShow } = await admin
        .from("category_showcase_settings")
        .select("category_label, retail_price");
      const norm = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
      const byNorm = new Map<string, number>();
      for (const row of allShow ?? []) {
        const price = sanitizeRetailPrice(row.retail_price);
        if (price != null && price > 0) {
          byNorm.set(norm(String(row.category_label ?? "")), price);
        }
      }
      for (const cat of categories) {
        if (!retailByCat.has(cat)) {
          const p = byNorm.get(norm(cat));
          if (p != null) retailByCat.set(cat, p);
        }
      }
    }

    const missing = categories.filter((c) => !retailByCat.has(c));
    if (missing.length) {
      return NextResponse.json(
        {
          error: `Falta preço de varejo em: ${missing.join(", ")}. Configure em Admin → Categorias.`,
        },
        { status: 400 }
      );
    }

    const saleAmountByCategory: Record<
      string,
      { unit_price: number; total: number; qty: number }
    > = {};
    let merchandiseTotal = 0;
    for (const cat of categories) {
      const unit = retailByCat.get(cat)!;
      const qty = qtyByCategory.get(cat) ?? 0;
      const total = Number((unit * qty).toFixed(2));
      saleAmountByCategory[cat] = { unit_price: unit, total, qty };
      merchandiseTotal += total;
    }
    const freight = Number(shippingPrice.toFixed(2));
    const grandTotal = Number((merchandiseTotal + freight).toFixed(2));

    const shippingLabel =
      String(body.shipping?.label ?? body.shipping?.service ?? "Frete").trim() ||
      "Frete";
    const customerNote = [
      `CEP: ${cepDigits}`,
      `Frete: ${shippingLabel} R$ ${freight.toFixed(2).replace(".", ",")}`,
      body.shipping?.deadlineDays != null
        ? `Prazo: ${body.shipping.deadlineDays} dia(s)`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const publicToken = randomBytes(18).toString("hex");
    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        status: "PENDENTE_PAGAMENTO",
        sales_channel: "VAREJO",
        customer_note: customerNote,
        customer_name: customerName,
        customer_whatsapp: customerWhatsapp,
        public_token: publicToken,
        sale_amount: grandTotal,
        sale_amount_by_category: saleAmountByCategory,
        payment_provider: "mercadopago",
      })
      .select("id, display_number")
      .single();

    if (oErr || !order) {
      const msg = oErr?.message ?? "Falha ao criar pedido";
      const hint = /sales_channel|retail_price/i.test(msg)
        ? "Verifique as migrations sales_channel e retail_price no Supabase."
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
          snapshot_image_url: productPublicImageUrl(p),
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

    const base = appPublicBaseUrl();
    if (!base) {
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        {
          error:
            "Defina NEXT_PUBLIC_APP_URL (ou NEXT_PUBLIC_SITE_URL) com o URL público do site.",
        },
        { status: 500 }
      );
    }

    const orderSummary = Object.entries(saleAmountByCategory)
      .map(([cat, info]) => `${info.qty}x ${cat.toUpperCase()}`)
      .join(" ");

    const toAbsoluteImageUrl = (raw: string): string | undefined => {
      const u = raw.trim();
      if (!u) return undefined;
      if (/^https?:\/\//i.test(u)) return u;
      if (u.startsWith("/")) return `${base}${u}`;
      return undefined;
    };

    type PreferenceItem = {
      id: string;
      title: string;
      description?: string;
      picture_url?: string;
      quantity: number;
      unit_price: number;
      currency_id: string;
      category_id?: string;
    };

    const preferenceItems: PreferenceItem[] = Array.from(
      qtyByProduct.entries()
    ).map(([productId, quantity]) => {
      const p = byId.get(productId)!;
      const cat =
        p.category != null && String(p.category).trim() !== ""
          ? String(p.category).trim()
          : "Sem categoria";
      const unit = retailByCat.get(cat)!;
      const title = `${p.brand} — ${p.color} (${p.size})`.slice(0, 250);
      const picture = toAbsoluteImageUrl(productPublicImageUrl(p, 320));
      return {
        id: productId.slice(0, 60),
        title,
        description: `${quantity}x ${cat.toUpperCase()} · varejo`.slice(0, 250),
        ...(picture ? { picture_url: picture } : {}),
        quantity,
        unit_price: unit,
        currency_id: "BRL",
        category_id: "fashion",
      };
    });
    if (freight > 0) {
      preferenceItems.push({
        id: "frete",
        title: shippingLabel.slice(0, 250),
        description: orderSummary
          ? `Pedido: ${orderSummary}`.slice(0, 250)
          : "Frete",
        quantity: 1,
        unit_price: freight,
        currency_id: "BRL",
      });
    }

    const canUseMpCallbacks = isMercadoPagoPublicHttpsUrl(base);
    const preferenceBody: Record<string, unknown> = {
      items: preferenceItems,
      external_reference: order.id,
      // Resumo tipo WhatsApp (visível em alguns ecrãs / atividades do MP)
      ...(orderSummary
        ? { additional_info: orderSummary.slice(0, 600) }
        : {}),
      back_urls: {
        success: `${base}/recibo/${publicToken}?pago=1`,
        pending: `${base}/recibo/${publicToken}?pago=pendente`,
        failure: `${base}/carrinho?mp=falhou`,
      },
      statement_descriptor: "DYCASHOP",
      // Prioriza PIX (sem login/conta MP). Só aparece se a conta tiver chave PIX
      // cadastrada e o Access Token for de produção (não test_user).
      payment_methods: {
        default_payment_method_id: "pix",
        installments: 12,
      },
      metadata: {
        order_id: order.id,
        sales_channel: "VAREJO",
        order_summary: orderSummary.slice(0, 200),
      },
      payer: {
        name: customerName,
      },
    };
    // MP rejeita auto_return / notification_url com http://localhost
    if (canUseMpCallbacks) {
      preferenceBody.auto_return = "approved";
      preferenceBody.notification_url = `${base}/api/payments/mercadopago/webhook`;
    }

    let pref: {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };
    try {
      const preference = createPreferenceClient();
      pref = await preference.create({ body: preferenceBody as never });
    } catch (mpErr) {
      console.error("[mp create-preference] preference.create", mpErr);
      await admin.from("order_items").delete().eq("order_id", order.id);
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: formatMercadoPagoError(mpErr) },
        { status: 502 }
      );
    }

    const preferenceId = String(pref.id ?? "");
    const initPoint =
      (pref.init_point as string | undefined) ||
      (pref.sandbox_init_point as string | undefined) ||
      "";

    if (!preferenceId || !initPoint) {
      await admin.from("order_items").delete().eq("order_id", order.id);
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: "Mercado Pago não devolveu link de pagamento" },
        { status: 502 }
      );
    }

    await admin
      .from("orders")
      .update({ payment_external_id: preferenceId })
      .eq("id", order.id);

    return NextResponse.json({
      orderId: order.id,
      orderDisplayNumber: order.display_number ?? null,
      publicToken,
      preferenceId,
      initPoint,
      total: grandTotal,
      merchandiseTotal,
      freight,
    });
  } catch (e) {
    console.error("[mp create-preference]", e);
    return NextResponse.json(
      { error: formatMercadoPagoError(e) },
      { status: 500 }
    );
  }
}
