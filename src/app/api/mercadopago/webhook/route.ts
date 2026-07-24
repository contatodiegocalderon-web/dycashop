import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoPagoPayment } from "@/lib/mercadopago";
import { applyPaidOrderStockAndDrive } from "@/lib/apply-paid-order-stock";
import { renameDriveFilesToCurrentStock } from "@/services/drive-rename-stock";
import { notifyAdminsVarejoPaid } from "@/lib/admin-push";
import {
  clearVarejoDriveSyncFailed,
  hasVarejoStockApplied,
  withVarejoDriveSync,
  withVarejoStockApplied,
} from "@/lib/varejo-drive-sync";

export const runtime = "nodejs";

function extractPaymentId(request: NextRequest, body: unknown): string | null {
  const url = new URL(request.url);
  const queryId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    url.searchParams.get("payment_id");
  if (queryId) return queryId;

  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const data = o.data;
    if (data && typeof data === "object") {
      const id = (data as Record<string, unknown>).id;
      if (id != null) return String(id);
    }
    if (o.id != null) return String(o.id);
  }
  return null;
}

async function productIdsForOrder(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<string[]> {
  const { data: items } = await admin
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  return Array.from(
    new Set(
      (items ?? [])
        .map((it) => String(it.product_id ?? "").trim())
        .filter(Boolean)
    )
  );
}

async function deleteZeroStockProducts(
  admin: ReturnType<typeof createAdminClient>,
  productIds: string[]
): Promise<void> {
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

function buildMetaAfterDrive(opts: {
  base: unknown;
  productIds: string[];
  driveOk: boolean;
  driveErrors: { productId: string; message: string }[];
}): Record<string, unknown> {
  let meta = withVarejoStockApplied(opts.base);
  if (opts.driveOk) {
    meta = clearVarejoDriveSyncFailed(meta);
  } else {
    meta = withVarejoDriveSync(meta, {
      status: "failed",
      at: new Date().toISOString(),
      product_ids: opts.productIds,
      errors: opts.driveErrors.filter((e) => e.productId !== "_rollback"),
    });
  }
  return meta;
}

export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const paymentId = extractPaymentId(request, body);
  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
    }

    if (payment.status !== "approved") {
      return NextResponse.json({ ok: true, status: payment.status });
    }

    const orderId = String(payment.external_reference ?? "").trim();
    if (!orderId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const admin = createAdminClient();
    const paymentIdStr = String(payment.id);

    // Claim atómico: evita dois webhooks baixarem stock em paralelo.
    const { data: claimed } = await admin
      .from("orders")
      .update({ mp_payment_id: paymentIdStr })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO")
      .is("mp_payment_id", null)
      .select("id, display_number, sale_amount_by_category")
      .maybeSingle();

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status, display_number, sale_amount_by_category, mp_payment_id")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr || !order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    if (order.status === "PAGO") {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    if (order.status !== "PENDENTE_PAGAMENTO") {
      return NextResponse.json({ ok: true, ignored: true, status: order.status });
    }

    if (String(order.mp_payment_id ?? "") !== paymentIdStr) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "payment_claimed_by_other",
      });
    }

    const dn = Number((order as { display_number?: unknown }).display_number);
    const stockAlreadyApplied = hasVarejoStockApplied(
      order.sale_amount_by_category
    );

    let driveRenamed = 0;
    let flaggedPending = 0;
    let driveOk = true;
    let driveErrors: { productId: string; message: string }[] = [];
    let productIds: string[] = [];
    let meta: unknown = order.sale_amount_by_category;

    if (!stockAlreadyApplied) {
      if (!claimed) {
        // Outro worker claimou e ainda não marcou stock — evita baixa duplicada.
        return NextResponse.json({
          ok: true,
          deferred: true,
          reason: "stock_in_progress",
        });
      }

      const stockResult = await applyPaidOrderStockAndDrive(admin, {
        orderId,
        confirmedDisplayNumber:
          Number.isFinite(dn) && dn > 0 ? dn : null,
      });

      if (!stockResult.ok) {
        console.error("[mp-webhook] stock:", stockResult.error);
        // Libera claim para o MP retentar.
        await admin
          .from("orders")
          .update({ mp_payment_id: null })
          .eq("id", orderId)
          .eq("status", "PENDENTE_PAGAMENTO")
          .eq("mp_payment_id", paymentIdStr);
        return NextResponse.json(
          { error: stockResult.error },
          { status: stockResult.status }
        );
      }

      driveRenamed = stockResult.driveRenamed;
      flaggedPending = stockResult.flaggedPending;
      driveOk = stockResult.driveOk;
      driveErrors = stockResult.driveErrors;
      productIds = stockResult.productIds;
      meta = buildMetaAfterDrive({
        base: order.sale_amount_by_category,
        productIds,
        driveOk,
        driveErrors,
      });

      // Persiste marker antes de PAGO — se crashar, o retry não re-baixa.
      await admin
        .from("orders")
        .update({ sale_amount_by_category: meta })
        .eq("id", orderId)
        .eq("status", "PENDENTE_PAGAMENTO");
    } else {
      productIds = await productIdsForOrder(admin, orderId);
      if (productIds.length > 0) {
        const rename = await renameDriveFilesToCurrentStock(productIds);
        driveRenamed = rename.ok.length;
        driveOk = rename.errors.length === 0;
        driveErrors = rename.errors;
        if (driveOk) {
          await deleteZeroStockProducts(admin, productIds);
        }
      }
      meta = buildMetaAfterDrive({
        base: order.sale_amount_by_category,
        productIds,
        driveOk,
        driveErrors,
      });
    }

    const confirmedAt = new Date().toISOString();
    const { error: uErr } = await admin
      .from("orders")
      .update({
        status: "PAGO",
        confirmed_at: confirmedAt,
        mp_payment_id: paymentIdStr,
        sale_amount_by_category: meta,
      })
      .eq("id", orderId)
      .eq("status", "PENDENTE_PAGAMENTO");

    if (uErr) {
      console.error("[mp-webhook] order update after stock:", uErr.message);
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    void notifyAdminsVarejoPaid({
      displayNumber: Number.isFinite(dn) && dn > 0 ? dn : null,
    });

    return NextResponse.json({
      ok: true,
      orderId,
      paymentId: payment.id,
      driveRenamed,
      driveOk,
      flaggedPending,
      stockAlreadyApplied,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
