import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryVarejoDriveSync } from "@/lib/apply-paid-order-stock";
import {
  clearVarejoDriveSyncFailed,
  isVarejoDrivePending,
  parseVarejoDriveSync,
  withVarejoDriveSync,
} from "@/lib/varejo-drive-sync";

export const runtime = "nodejs";

/**
 * POST /api/admin/varejo-orders/confirm-drive
 * Body: { orderId }
 * Re-tenta alinhar Drive após pagamento MP com falha de rename.
 */
export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não autorizado" },
      { status }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    const orderId = String(
      (body as { orderId?: unknown })?.orderId ?? ""
    ).trim();
    if (!orderId) {
      return NextResponse.json({ error: "Informe orderId" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status, sales_channel, sale_amount_by_category")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    if (!order || order.sales_channel !== "VAREJO") {
      return NextResponse.json(
        { error: "Pedido varejo não encontrado" },
        { status: 404 }
      );
    }
    if (order.status !== "PAGO") {
      return NextResponse.json(
        { error: "Só é possível confirmar Drive em pedido já pago." },
        { status: 400 }
      );
    }
    if (!isVarejoDrivePending(order.sale_amount_by_category)) {
      return NextResponse.json({
        ok: true,
        alreadySynced: true,
        message: "Drive já está sincronizado neste pedido.",
      });
    }

    const pending = parseVarejoDriveSync(order.sale_amount_by_category);
    const result = await retryVarejoDriveSync(admin, {
      orderId,
      productIds: pending?.product_ids,
    });

    if (!result.ok) {
      const meta = withVarejoDriveSync(order.sale_amount_by_category, {
        status: "failed",
        at: new Date().toISOString(),
        product_ids: result.productIds,
        errors: result.errors.filter((e) => e.productId !== "_rollback"),
      });
      await admin
        .from("orders")
        .update({ sale_amount_by_category: meta })
        .eq("id", orderId);

      const details = result.errors
        .filter((e) => e.productId !== "_rollback")
        .map((e) => e.message)
        .join(" | ");
      return NextResponse.json(
        {
          error: `Ainda falhou ao atualizar o Drive. ${details}`,
          driveErrors: result.errors,
        },
        { status: 409 }
      );
    }

    const meta = clearVarejoDriveSyncFailed(order.sale_amount_by_category);
    await admin
      .from("orders")
      .update({ sale_amount_by_category: meta })
      .eq("id", orderId);

    return NextResponse.json({
      ok: true,
      renamed: result.renamed,
      productIds: result.productIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
