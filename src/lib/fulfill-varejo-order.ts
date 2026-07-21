import { createAdminClient } from "@/lib/supabase/admin";
import { renameDriveFilesToCurrentStock } from "@/services/drive-rename-stock";
import { flagPendingOrdersAfterConfirm } from "@/lib/order-stock-conflict";
import { upsertAutoBusinessProfileOnConfirm } from "@/lib/crm-auto-profile";
import {
  clearAbandonedCrmHistory,
  purgeCancelledOrdersOnConfirm,
} from "@/lib/crm-abandoned-query";
import { isConfirmLockPayload } from "@/lib/order-drive-retry";

type Admin = ReturnType<typeof createAdminClient>;

export type FulfillVarejoResult =
  | { ok: true; alreadyPaid?: boolean }
  | { ok: false; error: string; status: number };

/**
 * Confirma pedido VAREJO já pago (Mercado Pago): baixa estoque, Drive e marca PAGO.
 * Idempotente se o pedido já estiver PAGO.
 */
export async function fulfillVarejoOrderPaid(
  admin: Admin,
  opts: {
    orderId: string;
    paymentExternalId: string;
    /** Se já temos o mapa de preços no pedido, não recalcula. */
  }
): Promise<FulfillVarejoResult> {
  const orderId = opts.orderId;

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select(
      "id, status, sale_amount, sale_amount_by_category, customer_name, customer_whatsapp, display_number, sales_channel, payment_external_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "Pedido não encontrado", status: 404 };
  }

  if (order.status === "PAGO") {
    return { ok: true, alreadyPaid: true };
  }
  if (order.status !== "PENDENTE_PAGAMENTO") {
    return {
      ok: false,
      error: `Pedido em estado ${order.status}`,
      status: 400,
    };
  }
  if (isConfirmLockPayload(order.sale_amount_by_category)) {
    return {
      ok: false,
      error: "Pedido bloqueado por sincronização Drive",
      status: 409,
    };
  }

  const { data: items, error: iErr } = await admin
    .from("order_items")
    .select("product_id, quantity, snapshot_category")
    .eq("order_id", orderId);

  if (iErr || !items?.length) {
    return { ok: false, error: "Itens não encontrados", status: 400 };
  }

  const confirmLock = {
    _confirm_lock: {
      at: new Date().toISOString(),
      by: "mercadopago_webhook",
      reason: "varejo_fulfill_in_progress",
    },
  };
  const { data: lockRows, error: lockErr } = await admin
    .from("orders")
    .update({ sale_amount_by_category: confirmLock })
    .eq("id", orderId)
    .eq("status", "PENDENTE_PAGAMENTO")
    .select("id");

  if (lockErr) {
    return { ok: false, error: lockErr.message, status: 500 };
  }
  if (!lockRows?.length) {
    // Outro processo ganhou a corrida — re-ler
    const { data: again } = await admin
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .maybeSingle();
    if (again?.status === "PAGO") return { ok: true, alreadyPaid: true };
    return {
      ok: false,
      error: "Pedido já em processamento",
      status: 409,
    };
  }

  const releaseLock = async () => {
    await admin
      .from("orders")
      .update({
        sale_amount_by_category: order.sale_amount_by_category ?? null,
      })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");
  };

  const totals = new Map<string, number>();
  for (const it of items) {
    if (!it.product_id) continue;
    totals.set(
      it.product_id,
      (totals.get(it.product_id) ?? 0) + Number(it.quantity || 0)
    );
  }
  const productIdList = Array.from(totals.keys());
  if (!productIdList.length) {
    await releaseLock();
    return { ok: false, error: "Pedido sem produtos válidos", status: 400 };
  }

  const originalByProductId = new Map<
    string,
    { stock: number; status: "ATIVO" | "ESGOTADO" }
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
      return {
        ok: false,
        error: `Produto ${productId} não encontrado`,
        status: 500,
      };
    }

    const available = Number(product.stock);
    if (available < qty) {
      await releaseLock();
      return {
        ok: false,
        error: `Estoque insuficiente para produto ${productId} (disp. ${available}, pedido ${qty})`,
        status: 409,
      };
    }

    const newStock = available - qty;
    originalByProductId.set(productId, {
      stock: available,
      status: (product.status as "ATIVO" | "ESGOTADO") ?? "ATIVO",
    });
    nextStockByProductId.set(productId, newStock);
    if (newStock <= 0) zeroAfterConfirm.push(productId);
  }

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
      return { ok: false, error: uErr.message, status: 500 };
    }
  }

  const driveRename = await renameDriveFilesToCurrentStock(productIdList);
  if (driveRename.errors.length > 0) {
    for (const productId of productIdList) {
      const prev = originalByProductId.get(productId);
      if (!prev) continue;
      await admin
        .from("products")
        .update({ stock: prev.stock, status: prev.status })
        .eq("id", productId);
    }
    await admin
      .from("orders")
      .update({
        sale_amount_by_category: {
          _confirm_lock: {
            at: new Date().toISOString(),
            by: "mercadopago_webhook",
            reason: "drive_rename_failed",
            drive_errors: driveRename.errors,
          },
        },
        payment_external_id: opts.paymentExternalId,
        payment_provider: "mercadopago",
      })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");
    return {
      ok: false,
      error: "Falha ao atualizar Drive; estoque restaurado",
      status: 409,
    };
  }

  const confirmedAt = new Date().toISOString();
  const saleMap = order.sale_amount_by_category;
  const saleAmount = Number(order.sale_amount ?? 0);

  const { error: fErr } = await admin
    .from("orders")
    .update({
      status: "PAGO",
      sale_amount: saleAmount > 0 ? saleAmount : null,
      sale_amount_by_category: saleMap,
      confirmed_at: confirmedAt,
      payment_provider: "mercadopago",
      payment_external_id: opts.paymentExternalId,
      customer_segment: "NOVO",
    })
    .eq("id", orderId)
    .eq("status", "PENDENTE_PAGAMENTO");

  if (fErr) {
    for (const productId of productIdList) {
      const prev = originalByProductId.get(productId);
      if (!prev) continue;
      await admin
        .from("products")
        .update({ stock: prev.stock, status: prev.status })
        .eq("id", productId);
    }
    await releaseLock();
    return { ok: false, error: fErr.message, status: 500 };
  }

  const wa = String(order.customer_whatsapp ?? "").replace(/\D/g, "");
  if (wa.length >= 10) {
    try {
      await upsertAutoBusinessProfileOnConfirm(admin, wa, saleAmount);
    } catch (e) {
      console.error("[fulfill-varejo] profile:", e);
    }
    try {
      await clearAbandonedCrmHistory(admin, wa);
    } catch (e) {
      console.error("[fulfill-varejo] abandoned:", e);
    }
    try {
      await purgeCancelledOrdersOnConfirm(admin, wa);
    } catch (e) {
      console.error("[fulfill-varejo] purge:", e);
    }
  }

  const stockAfterByProductId = new Map<string, number>();
  for (const productId of productIdList) {
    stockAfterByProductId.set(
      productId,
      nextStockByProductId.get(productId) ?? 0
    );
  }
  const dn = Number(order.display_number);
  await flagPendingOrdersAfterConfirm(admin, {
    confirmedOrderId: orderId,
    confirmedDisplayNumber: Number.isFinite(dn) && dn > 0 ? dn : null,
    stockAfterByProductId,
  });

  for (const productId of zeroAfterConfirm) {
    await admin.from("products").delete().eq("id", productId);
  }

  return { ok: true };
}
