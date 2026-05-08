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
  saleByCategory: Record<string, number>;
  customerName: string;
  customerWhatsApp: string;
  customerSegment: CustomerSegment;
} {
  if (raw == null || typeof raw !== "object") {
    throw new Error("Body JSON inválido");
  }
  const o = raw as Record<string, unknown>;
  const saleAmountRaw = Number(o.saleAmount ?? o.sale_amount ?? 0);
  const saleByCategoryRaw = o.saleByCategory ?? o.sale_by_category;
  const customerName = String(o.customerName ?? o.customer_name ?? "").trim();
  const customerWhatsApp = String(
    o.customerWhatsApp ?? o.customer_whatsapp ?? ""
  ).trim();
  const segRaw = String(
    o.customerSegment ?? o.customer_segment ?? ""
  ).toUpperCase();

  const saleAmount = Number.isNaN(saleAmountRaw) ? 0 : saleAmountRaw;
  const saleByCategory: Record<string, number> = {};
  if (saleByCategoryRaw && typeof saleByCategoryRaw === "object") {
    for (const [k, v] of Object.entries(saleByCategoryRaw as Record<string, unknown>)) {
      const label = String(k).trim();
      if (!label) continue;
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) {
        throw new Error(`Preço por peça inválido em saleByCategory para ${label}`);
      }
      saleByCategory[label] = n;
    }
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
    saleByCategory,
    customerName,
    customerWhatsApp: wa,
    customerSegment: segRaw as CustomerSegment,
  };
}

/**
 * POST /api/admin/orders/confirm/[orderId]
 * Corpo: { saleAmount, saleByCategory, customerName, customerWhatsApp, customerSegment }
 * `saleByCategory` recebe PREÇO POR PEÇA; o servidor multiplica pela quantidade.
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

  try {
    const admin = createAdminClient();
    let confirmedByStaffId: string | null =
      principal?.kind === "staff" ? principal.staff.staffId : null;
    if (!confirmedByStaffId && principal?.kind === "api_key") {
      const { data: ownerRow } = await admin
        .from("staff_users")
        .select("id")
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();
      confirmedByStaffId = (ownerRow?.id as string | undefined) ?? null;
    }

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status, sale_amount_by_category")
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
    const existingLock =
      order.sale_amount_by_category &&
      typeof order.sale_amount_by_category === "object" &&
      "_confirm_lock" in (order.sale_amount_by_category as Record<string, unknown>);
    if (existingLock) {
      return NextResponse.json(
        {
          error:
            "Este pedido está bloqueado após uma falha de sincronização com o Drive. Não é permitido confirmar novamente para evitar renomeações duplicadas.",
        },
        { status: 409 }
      );
    }

    const { data: items, error: iErr } = await admin
      .from("order_items")
      .select("product_id, quantity, snapshot_category")
      .eq("order_id", orderId);

    if (iErr || !items?.length) {
      return NextResponse.json({ error: "Itens não encontrados" }, { status: 400 });
    }

    // Lock pessimista no próprio pedido para impedir dupla confirmação/dupla renomeação.
    const confirmLock = {
      _confirm_lock: {
        at: new Date().toISOString(),
        by: confirmedByStaffId ?? "api_key",
        reason: "confirm_in_progress",
      },
    };
    const { data: lockRows, error: lockErr } = await admin
      .from("orders")
      .update({ sale_amount_by_category: confirmLock })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO")
      .is("sale_amount_by_category", null)
      .select("id");
    if (lockErr) {
      return NextResponse.json({ error: lockErr.message }, { status: 500 });
    }
    if (!lockRows || lockRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Este pedido já está em processamento ou bloqueado por tentativa anterior. Atualize a lista.",
        },
        { status: 409 }
      );
    }
    const releaseLock = async () => {
      await admin
        .from("orders")
        .update({ sale_amount_by_category: null })
        .eq("id", orderId)
        .eq("status", "PENDENTE_PAGAMENTO");
    };

    const categoriesInOrder = new Set<string>();
    const qtyByCategory: Record<string, number> = {};
    const totals = new Map<string, number>();
    for (const it of items) {
      const cat = it.snapshot_category?.trim() || "Sem categoria";
      categoriesInOrder.add(cat);
      qtyByCategory[cat] = (qtyByCategory[cat] ?? 0) + it.quantity;
      if (!it.product_id) continue;
      totals.set(
        it.product_id,
        (totals.get(it.product_id) ?? 0) + it.quantity
      );
    }

    const productIdList = Array.from(totals.keys());
    const originalByProductId = new Map<
      string,
      {
        stock: number;
        status: "ATIVO" | "ESGOTADO";
      }
    >();
    const nextStockByProductId = new Map<string, number>();
    const zeroAfterConfirm: string[] = [];

    for (const productId of productIdList) {
      const qty = totals.get(productId)!;
      const { data: product, error: pErr } = await admin
        .from("products")
        .select("id, stock, status")
        .eq("id", productId)
        .single();

      if (pErr || !product) {
        await releaseLock();
        return NextResponse.json(
          { error: `Produto ${productId} não encontrado` },
          { status: 500 }
        );
      }
      if (product.stock <= 0) {
        await releaseLock();
        return NextResponse.json(
          {
            error: `Produto ${productId} está com estoque 0. Atualize os pedidos pendentes para remover itens indisponíveis.`,
          },
          { status: 400 }
        );
      }
      if (product.stock < qty) {
        await releaseLock();
        return NextResponse.json(
          {
            error: `Estoque insuficiente no produto ${productId}. Atual: ${product.stock}, necessário: ${qty}`,
          },
          { status: 400 }
        );
      }

      const newStock = product.stock - qty;
      originalByProductId.set(productId, {
        stock: Number(product.stock),
        status: (product.status as "ATIVO" | "ESGOTADO") ?? "ATIVO",
      });
      nextStockByProductId.set(productId, newStock);
      if (newStock <= 0) zeroAfterConfirm.push(productId);
    }

    // 1) Aplica novo stock na BD (ainda sem confirmar o pedido).
    for (const productId of productIdList) {
      const newStock = nextStockByProductId.get(productId) ?? 0;
      const { error: uErr } = await admin
        .from("products")
        .update({
          stock: Math.max(0, newStock),
          status: newStock <= 0 ? "ESGOTADO" : "ATIVO",
        })
        .eq("id", productId);
      if (uErr) {
        await releaseLock();
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }
    }

    const confirmedAt = new Date().toISOString();

    const saleAmountByCategoryTotal: Record<
      string,
      { unit_price: number; total: number; qty: number }
    > = {};
    let computedSaleAmount = 0;
    for (const cat of Array.from(categoriesInOrder)) {
      const pricePerPiece = bodyParsed.saleByCategory[cat];
      if (pricePerPiece == null) {
        return NextResponse.json(
          { error: `Informe o valor vendido para a categoria ${cat}` },
          { status: 400 }
        );
      }
      const qty = qtyByCategory[cat] ?? 0;
      const totalCat = Number((pricePerPiece * qty).toFixed(2));
      saleAmountByCategoryTotal[cat] = {
        unit_price: pricePerPiece,
        total: totalCat,
        qty,
      };
      computedSaleAmount += totalCat;
    }
    if (computedSaleAmount <= 0 && bodyParsed.saleAmount > 0) {
      computedSaleAmount = bodyParsed.saleAmount;
    }
    // 2) Renomeia/apaga no Drive conforme novo stock. Se falhar, desfaz tudo.
    const driveRename = await renameDriveFilesToCurrentStock(productIdList);
    if (driveRename.errors.length > 0) {
      // Rollback de stock/status
      for (const productId of productIdList) {
        const prev = originalByProductId.get(productId);
        if (!prev) continue;
        await admin
          .from("products")
          .update({
            stock: prev.stock,
            status: prev.status,
          })
          .eq("id", productId);
      }
      const details = driveRename.errors
        .map((e) => `${e.productId}: ${e.message}`)
        .join(" | ");
      return NextResponse.json(
        {
          error:
            "Falha ao atualizar nomes no Drive. Pedido NÃO foi confirmado e o estoque foi restaurado. Pedido bloqueado para evitar nova renomeação duplicada.",
          driveRename: {
            renamed: driveRename.ok.length,
            errors: driveRename.errors,
            details,
          },
        },
        { status: 409 }
      );
    }

    // 3) Pedido confirmado somente após Drive OK.
    const orderUpdate: Record<string, unknown> = {
      status: "PAGO",
      sale_amount: Number(computedSaleAmount.toFixed(2)),
      sale_amount_by_category: saleAmountByCategoryTotal,
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
      // rollback de stock/status se falhar confirmação do pedido
      for (const productId of productIdList) {
        const prev = originalByProductId.get(productId);
        if (!prev) continue;
        await admin
          .from("products")
          .update({
            stock: prev.stock,
            status: prev.status,
          })
          .eq("id", productId);
      }
      await releaseLock();
      return NextResponse.json({ error: fErr.message }, { status: 500 });
    }

    // 4) Limpeza final: remove produtos que zeraram.
    for (const productId of zeroAfterConfirm) {
      await admin.from("products").delete().eq("id", productId);
    }

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
