import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { getDriveAuth, ensureDriveAuthorized } from "@/lib/drive-auth";
import { expectedDriveFileName } from "@/services/drive-rename-stock";
import { parseDriveRetry } from "@/lib/order-drive-retry";
import { stripImageExtension } from "@/lib/parse-filename";
import type { Product } from "@/types";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DriveSyncLineStatus =
  | "synced"
  | "drive_ahead"
  | "file_missing"
  | "name_mismatch"
  | "would_delete";

export type DriveSyncLine = {
  product_id: string;
  brand: string;
  color: string;
  qty_in_order: number;
  db_stock: number;
  stock_after_confirm: number;
  drive_file_id: string;
  drive_exists: boolean;
  drive_current_name: string | null;
  expected_name_for_db_stock: string;
  expected_name_after_confirm: string | null;
  status: DriveSyncLineStatus;
  hint: string;
};

function normalizeName(name: string): string {
  return stripImageExtension(name).trim().replace(/\s+/g, " ");
}

/**
 * GET /api/admin/orders/[orderId]/drive-sync-diagnostic
 * Compara BD vs Drive para cada produto do pedido (útil após falha parcial na confirmação).
 */
export async function GET(
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

  const orderId = params.orderId?.trim() ?? "";
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "ID de pedido inválido" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, status, display_number, sale_amount_by_category")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const { data: items, error: iErr } = await admin
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);

    if (iErr) {
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }

    const qtyByProduct = new Map<string, number>();
    for (const it of items ?? []) {
      if (!it.product_id) continue;
      qtyByProduct.set(
        it.product_id,
        (qtyByProduct.get(it.product_id) ?? 0) + it.quantity
      );
    }

    const lockRaw = order.sale_amount_by_category;
    let lastDriveFailure: {
      ok?: string[];
      errors?: { productId: string; message: string }[];
    } | null = null;
    if (lockRaw && typeof lockRaw === "object" && "_confirm_lock" in lockRaw) {
      const lock = (lockRaw as Record<string, unknown>)._confirm_lock;
      if (lock && typeof lock === "object") {
        const l = lock as Record<string, unknown>;
        if (l.reason === "drive_rename_failed") {
          lastDriveFailure = {
            ok: Array.isArray(l.drive_ok) ? (l.drive_ok as string[]) : undefined,
            errors: Array.isArray(l.drive_errors)
              ? (l.drive_errors as { productId: string; message: string }[])
              : undefined,
          };
        }
      }
    }

    let drive: ReturnType<typeof google.drive> | null = null;
    try {
      const auth = await getDriveAuth();
      await ensureDriveAuthorized(auth);
      drive = google.drive({ version: "v3", auth });
    } catch {
      drive = null;
    }

    const lines: DriveSyncLine[] = [];

    for (const [productId, qtyInOrder] of Array.from(qtyByProduct.entries())) {
      const { data: p } = await admin
        .from("products")
        .select("id, brand, color, stock, drive_file_id, original_file_name")
        .eq("id", productId)
        .maybeSingle();

      if (!p) {
        lines.push({
          product_id: productId,
          brand: "—",
          color: "—",
          qty_in_order: qtyInOrder,
          db_stock: 0,
          stock_after_confirm: 0,
          drive_file_id: "",
          drive_exists: false,
          drive_current_name: null,
          expected_name_for_db_stock: "",
          expected_name_after_confirm: null,
          status: "file_missing",
          hint: "Produto já não existe na base (pode ter sido removido após esgotar).",
        });
        continue;
      }

      const product = p as Pick<
        Product,
        "id" | "brand" | "color" | "stock" | "drive_file_id" | "original_file_name"
      >;
      const dbStock = Number(product.stock);
      const stockAfterConfirm = Math.max(0, dbStock - qtyInOrder);
      const expectedDb = expectedDriveFileName(product, dbStock);
      const expectedAfter =
        stockAfterConfirm > 0
          ? expectedDriveFileName(product, stockAfterConfirm)
          : null;

      let driveExists = false;
      let driveCurrentName: string | null = null;

      if (drive && product.drive_file_id) {
        try {
          const meta = await drive.files.get({
            fileId: product.drive_file_id,
            fields: "name",
            supportsAllDrives: true,
          });
          driveExists = true;
          driveCurrentName = meta.data.name ?? null;
        } catch {
          driveExists = false;
        }
      }

      const driveNorm = driveCurrentName
        ? normalizeName(driveCurrentName)
        : null;
      const normDb = normalizeName(expectedDb);
      const normAfter = expectedAfter ? normalizeName(expectedAfter) : null;

      let status: DriveSyncLineStatus;
      let hint: string;

      if (stockAfterConfirm <= 0) {
        status = driveExists ? "would_delete" : "synced";
        hint = driveExists
          ? "Na confirmação este ficheiro seria apagado do Drive (stock ficaria 0). Verifique se o nome no Drive ainda reflete stock antigo."
          : "Ficheiro já ausente no Drive — alinhado com esgotamento.";
      } else if (!driveExists) {
        status = "file_missing";
        hint =
          "ID do Drive na base não existe (ficheiro movido/apagado ou ID errado). Corrija em Configuração com sincronização ou atualize o ID manualmente.";
      } else if (driveNorm === normDb) {
        status = "synced";
        hint = "Nome no Drive corresponde ao stock actual na base.";
      } else if (normAfter && driveNorm === normAfter) {
        status = "drive_ahead";
        hint =
          "Drive já foi renomeado como se a venda tivesse sido confirmada, mas o stock na base foi reposto. Renomeie no Drive para o stock actual OU confirme o pedido após alinhar.";
      } else {
        status = "name_mismatch";
        hint = `Drive: «${driveNorm}». Base espera: «${normDb}». Após confirmar seria: «${normAfter ?? "apagar"}».`;
      }

      lines.push({
        product_id: productId,
        brand: product.brand,
        color: product.color,
        qty_in_order: qtyInOrder,
        db_stock: dbStock,
        stock_after_confirm: stockAfterConfirm,
        drive_file_id: product.drive_file_id,
        drive_exists: driveExists,
        drive_current_name: driveCurrentName,
        expected_name_for_db_stock: expectedDb,
        expected_name_after_confirm: expectedAfter,
        status,
        hint,
      });
    }

    const summary = {
      total: lines.length,
      synced: lines.filter((l) => l.status === "synced").length,
      drive_ahead: lines.filter((l) => l.status === "drive_ahead").length,
      file_missing: lines.filter((l) => l.status === "file_missing").length,
      name_mismatch: lines.filter((l) => l.status === "name_mismatch").length,
      would_delete: lines.filter((l) => l.status === "would_delete").length,
    };

    const drive_retry = parseDriveRetry(order.sale_amount_by_category);

    return NextResponse.json({
      order_id: orderId,
      display_number: order.display_number ?? null,
      status: order.status,
      lines,
      summary,
      last_drive_failure: lastDriveFailure,
      drive_retry,
      drive_configured: drive !== null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
