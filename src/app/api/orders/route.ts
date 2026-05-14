import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOrderDisplayNumberPublic } from "@/lib/order-display-number";
import { productPublicImageUrl } from "@/lib/product-image-url";
import { getClientIp, rateLimitAllow } from "@/lib/rate-limit-ip";
import type { Product } from "@/types";

/** Limites para reduzir abuso / payloads enormes */
const MAX_DISTINCT_PRODUCTS = 200;
const MAX_QTY_PER_LINE = 500;
const MAX_TOTAL_QTY = 200;
const MAX_NOTE_LEN = 4000;
const MAX_NAME_LEN = 120;
const MAX_SELLER_LEN = 100;

function snapshotImageUrl(p: Product): string {
  return productPublicImageUrl(p);
}

type BodyItem = { productId: string; quantity: number };

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
      !rateLimitAllow(`order:${ip}`, "orders_post", {
        max: rlMax,
        windowMs: rlWindow,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "Muitos pedidos a partir desta rede. Aguarde alguns minutos e tente novamente.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rlWindow / 1000)) },
        }
      );
    }

    const body = (await request.json()) as {
      items?: BodyItem[];
      customerNote?: string;
      customerName?: string;
      customerWhatsApp?: string;
      sellerName?: string;
      sellerPhone?: string;
    };
    const rawCustomerWhatsappDigits = String(body.customerWhatsApp ?? "").replace(/\D/g, "");
    const customerWhatsappDigits = rawCustomerWhatsappDigits
      ? rawCustomerWhatsappDigits.startsWith("55")
        ? rawCustomerWhatsappDigits
        : `55${rawCustomerWhatsappDigits}`
      : "";
    const items = body.items;
    if (!items?.length) {
      return NextResponse.json({ error: "items obrigatório" }, { status: 400 });
    }
    if (items.length > MAX_DISTINCT_PRODUCTS) {
      return NextResponse.json(
        {
          error: `No máximo ${MAX_DISTINCT_PRODUCTS} linhas por pedido. Divida em dois pedidos.`,
        },
        { status: 400 }
      );
    }

    const noteRaw = String(body.customerNote ?? "");
    if (noteRaw.length > MAX_NOTE_LEN) {
      return NextResponse.json(
        { error: `Observação demasiado longa (máx. ${MAX_NOTE_LEN} caracteres).` },
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
    if (customerWhatsappDigits.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido (mínimo 10 dígitos, com DDD)." },
        { status: 400 }
      );
    }
    const sellerNameRaw = String(body.sellerName ?? "").trim();
    if (sellerNameRaw.length > MAX_SELLER_LEN) {
      return NextResponse.json(
        { error: `Nome do vendedor demasiado longo (máx. ${MAX_SELLER_LEN}).` },
        { status: 400 }
      );
    }
    const sellerPhoneRaw = String(body.sellerPhone ?? "").trim().slice(0, 40);

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
          {
            error: `Quantidade por linha demasiado alta (máx. ${MAX_QTY_PER_LINE}).`,
          },
          { status: 400 }
        );
      }
      qtyByProduct.set(
        it.productId,
        (qtyByProduct.get(it.productId) ?? 0) + it.quantity
      );
    }

    const totalQtyOrdered = Array.from(qtyByProduct.values()).reduce((a, b) => a + b, 0);
    if (totalQtyOrdered > MAX_TOTAL_QTY) {
      return NextResponse.json(
        {
          error: `Total de peças por pedido demasiado alto (máx. ${MAX_TOTAL_QTY}).`,
        },
        { status: 400 }
      );
    }

    const qtyKeys = Array.from(qtyByProduct.keys());
    for (const pid of qtyKeys) {
      const qty = qtyByProduct.get(pid)!;
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

    const publicToken = randomBytes(18).toString("hex");

    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        status: "PENDENTE_PAGAMENTO",
        customer_note: noteRaw.trim() || null,
        customer_name: nameRaw || null,
        customer_whatsapp:
          customerWhatsappDigits.length >= 10 ? customerWhatsappDigits : null,
        requested_seller_name: sellerNameRaw || null,
        requested_seller_phone: sellerPhoneRaw || null,
        public_token: publicToken,
      })
      .select("id, display_number")
      .single();

    if (oErr || !order) {
      const msg = oErr?.message ?? "Falha ao criar pedido";
      const hint =
        /public_token|column/i.test(msg)
          ? "Execute o SQL em supabase/migration_order_public_token.sql no painel do Supabase."
          : undefined;
      return NextResponse.json(
        { error: msg, ...(hint ? { hint } : {}) },
        { status: 500 }
      );
    }

    const orderItems = items.map((it) => {
      const p = byId.get(it.productId)!;
      const cat =
        p.category != null && String(p.category).trim() !== ""
          ? String(p.category).trim()
          : "Sem categoria";
      return {
        order_id: order.id,
        product_id: p.id,
        quantity: it.quantity,
        snapshot_image_url: snapshotImageUrl(p),
        snapshot_original_name: p.original_file_name,
        snapshot_brand: p.brand,
        snapshot_color: p.color,
        snapshot_size: p.size,
        snapshot_drive_file_id: p.drive_file_id,
        snapshot_category: cat,
      };
    });

    const { error: iErr } = await admin.from("order_items").insert(orderItems);
    if (iErr) {
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }

    const siteBase =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
    const receiptUrl = siteBase
      ? `${siteBase}/recibo/${publicToken}`
      : null;

    const dn = Number((order as { display_number?: unknown }).display_number);
    const orderDisplayNumber =
      Number.isFinite(dn) && dn > 0 ? dn : await fetchOrderDisplayNumberPublic(order.id);
    return NextResponse.json({
      orderId: order.id,
      orderDisplayNumber,
      publicToken,
      /** Absoluto se NEXT_PUBLIC_SITE_URL estiver definido; senão o cliente monta com window.location.origin */
      receiptUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
