import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { renameDriveFilesToCurrentStock } from "@/services/drive-rename-stock";
import type { CustomerSegment } from "@/types";

export const runtime = "nodejs";

function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function parseConfirmBody(raw: unknown): {
  saleAmount: number;
  customerName: string;
  customerWhatsApp: string;
  customerSegment: CustomerSegment;
} {
  if (raw == null || typeof raw !== "object") {
    throw new Error("Body JSON inválido");
  }
  const o = raw as Record<string, unknown>;
  const saleAmount = Number(o.saleAmount ?? o.sale_amount);
  const customerName = String(o.customerName ?? o.customer_name ?? "").trim();
  const customerWhatsApp = String(
    o.customerWhatsApp ?? o.customer_whatsapp ?? ""
  ).trim();
  const segRaw = String(
    o.customerSegment ?? o.customer_segment ?? ""
  ).toUpperCase();

  if (Number.isNaN(saleAmount) || saleAmount <= 0) {
    throw new Error("Informe saleAmount (valor do pedido) maior que zero");
  }
  if (!customerName) {
    throw new Error("Informe o nome do cliente");
  }
  const wa = normalizeDigits(customerWhatsApp);
  if (wa.length < 10) {
    throw new Error("Informe um WhatsApp válido (mínimo 10 dígitos)");
  }
  if (segRaw !== "NOVO" && segRaw !== "ANTIGO") {
    throw new Error('Informe customerSegment: "NOVO" ou "ANTIGO"');
  }

  return {
    saleAmount,
    customerName,
    customerWhatsApp: wa,
    customerSegment: segRaw as CustomerSegment,
  };
}

/**
 * POST /api/admin/orders/confirm/[orderId]
 * Corpo: { saleAmount, customerName, customerWhatsApp, customerSegment }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  const orderId = params.orderId;

  let bodyParsed: ReturnType<typeof parseConfirmBody>;
  try {
    const json = await request.json();
    bodyParsed = parseConfirmBody(json);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Body inválido" },
      { status: 400 }
    );
  }

  const principal = await resolvePrincipal(request);
  const confirmedByStaffId =
    principal?.kind === "staff" ? principal.staff.staffId : null;

  try {
    const admin = createAdminClient();

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (oErr || !order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (order.status !== "PENDENTE_PAGAMENTO") {
      return NextResponse.json(
        { error: "Pedido não está pendente de pagamento" },
        { status: 400 }
      );
    }

    const { data: items, error: iErr } = await admin
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);

    if (iErr || !items?.length) {
      return NextResponse.json({ error: "Itens não encontrados" }, { status: 400 });
    }

    const totals = new Map<string, number>();
    for (const it of items) {
      if (!it.product_id) continue;
      totals.set(
        it.product_id,
        (totals.get(it.product_id) ?? 0) + it.quantity
      );
    }

    const productIdList = Array.from(totals.keys());
    for (const productId of productIdList) {
      const qty = totals.get(productId)!;
      const { data: product, error: pErr } = await admin
        .from("products")
        .select("id, stock, status")
        .eq("id", productId)
        .single();

      if (pErr || !product) {
        return NextResponse.json(
          { error: `Produto ${productId} não encontrado` },
          { status: 500 }
        );
      }
      if (product.stock < qty) {
        return NextResponse.json(
          {
            error: `Estoque insuficiente no produto ${productId}. Atual: ${product.stock}, necessário: ${qty}`,
          },
          { status: 400 }
        );
      }

      const newStock = product.stock - qty;
      const { error: uErr } = await admin
        .from("products")
        .update({
          stock: newStock,
          status: newStock <= 0 ? "ESGOTADO" : "ATIVO",
        })
        .eq("id", productId);

      if (uErr) {
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }
    }

    const confirmedAt = new Date().toISOString();

    const orderUpdate: Record<string, unknown> = {
      status: "PAGO",
      sale_amount: bodyParsed.saleAmount,
      customer_name: bodyParsed.customerName,
      customer_whatsapp: bodyParsed.customerWhatsApp,
      customer_segment: bodyParsed.customerSegment,
      confirmed_at: confirmedAt,
    };
    if (confirmedByStaffId) {
      orderUpdate.confirmed_by_staff_id = confirmedByStaffId;
    }

    const { error: fErr } = await admin
      .from("orders")
      .update(orderUpdate)
      .eq("id", orderId);

    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 500 });
    }

    // Só renomeia no Drive os produtos deste pedido (rápido). Sincronização completa
    // catálogo ↔ Drive corre no job diário /api/cron/daily-catalog-sync.
    const driveRename = await renameDriveFilesToCurrentStock(productIdList);

    return NextResponse.json({
      ok: true,
      driveRename: {
        renamed: driveRename.ok.length,
        errors: driveRename.errors,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
