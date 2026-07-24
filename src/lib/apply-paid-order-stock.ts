import type { SupabaseClient } from "@supabase/supabase-js";
import { renameDriveFilesToCurrentStock } from "@/services/drive-rename-stock";
import { flagPendingOrdersAfterConfirm } from "@/lib/order-stock-conflict";

export type ApplyPaidOrderStockResult =
  | {
      ok: true;
      productIds: string[];
      stockAfterByProductId: Map<string, number>;
      zeroAfterConfirm: string[];
      driveRenamed: number;
      driveErrors: { productId: string; message: string }[];
      driveOk: boolean;
      flaggedPending: number;
    }
  | { ok: false; error: string; status: number };

/**
 * Baixa estoque na BD e tenta alinhar o Drive.
 * Não marca o pedido como PAGO — o caller faz isso.
 * Em falha do Drive NÃO restaura estoque (pagamento MP já ocorreu):
 * o caller grava aviso e o admin confirma o Drive depois.
 */
export async function applyPaidOrderStockAndDrive(
  admin: SupabaseClient,
  opts: {
    orderId: string;
    confirmedDisplayNumber?: number | null;
    /**
     * Só apaga produtos zerados se o Drive OK.
     * Em falha do Drive, mantém ESGOTADO até confirmação manual.
     */
    deleteZeroStockProducts?: boolean;
  }
): Promise<ApplyPaidOrderStockResult> {
  const { data: items, error: iErr } = await admin
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", opts.orderId);

  if (iErr || !items?.length) {
    return {
      ok: false,
      error: iErr?.message ?? "Itens do pedido não encontrados.",
      status: 409,
    };
  }

  const totals = new Map<string, number>();
  for (const it of items) {
    if (!it.product_id) continue;
    totals.set(
      it.product_id,
      (totals.get(it.product_id) ?? 0) + Number(it.quantity ?? 0)
    );
  }

  const productIdList = Array.from(totals.keys());
  if (productIdList.length === 0) {
    return {
      ok: false,
      error: "Pedido sem produtos válidos para baixa de estoque.",
      status: 409,
    };
  }

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
      return {
        ok: false,
        error: `Produto ${productId} não encontrado.`,
        status: 409,
      };
    }

    const available = Number(product.stock ?? 0);
    if (available <= 0) {
      return {
        ok: false,
        error: `Produto ${productId} sem estoque.`,
        status: 409,
      };
    }

    const deducted = Math.min(available, qty);
    const newStock = available - deducted;
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
      return { ok: false, error: uErr.message, status: 500 };
    }
  }

  const driveRename = await renameDriveFilesToCurrentStock(productIdList);
  const driveOk = driveRename.errors.length === 0;

  let flaggedPending = 0;
  try {
    flaggedPending = await flagPendingOrdersAfterConfirm(admin, {
      confirmedOrderId: opts.orderId,
      confirmedDisplayNumber: opts.confirmedDisplayNumber ?? null,
      stockAfterByProductId: nextStockByProductId,
    });
  } catch (e) {
    console.error("[apply-paid-order-stock] flagPending:", e);
  }

  const deleteZero = opts.deleteZeroStockProducts !== false && driveOk;
  if (deleteZero) {
    for (const productId of zeroAfterConfirm) {
      await admin.from("products").delete().eq("id", productId);
    }
  }

  return {
    ok: true,
    productIds: productIdList,
    stockAfterByProductId: nextStockByProductId,
    zeroAfterConfirm,
    driveRenamed: driveRename.ok.length,
    driveErrors: driveRename.errors,
    driveOk,
    flaggedPending,
  };
}

/** Re-tenta só o Drive (estoque já baixado). Apaga produtos zerados se OK. */
export async function retryVarejoDriveSync(
  admin: SupabaseClient,
  opts: { orderId: string; productIds?: string[] }
): Promise<{
  ok: boolean;
  productIds: string[];
  renamed: number;
  errors: { productId: string; message: string }[];
}> {
  let productIds = (opts.productIds ?? []).filter(Boolean);

  if (productIds.length === 0) {
    const { data: items, error } = await admin
      .from("order_items")
      .select("product_id")
      .eq("order_id", opts.orderId);
    if (error) {
      return {
        ok: false,
        productIds: [],
        renamed: 0,
        errors: [{ productId: "_order", message: error.message }],
      };
    }
    productIds = Array.from(
      new Set(
        (items ?? [])
          .map((it) => String(it.product_id ?? "").trim())
          .filter(Boolean)
      )
    );
  }

  if (productIds.length === 0) {
    return {
      ok: true,
      productIds: [],
      renamed: 0,
      errors: [],
    };
  }

  const rename = await renameDriveFilesToCurrentStock(productIds);
  if (rename.errors.length === 0) {
    for (const productId of productIds) {
      const { data: p } = await admin
        .from("products")
        .select("id, stock")
        .eq("id", productId)
        .maybeSingle();
      if (p && Number(p.stock ?? 0) <= 0) {
        await admin.from("products").delete().eq("id", productId);
      }
    }
  }

  return {
    ok: rename.errors.length === 0,
    productIds,
    renamed: rename.ok.length,
    errors: rename.errors,
  };
}
