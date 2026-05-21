import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProductOrderable } from "@/lib/product-availability";
import { productPublicImageUrl } from "@/lib/product-image-url";
import type { Product } from "@/types";

type BodyItem = { productId: string; quantity: number };

export type CartValidateLineResult =
  | { productId: string; status: "ok"; available: number; quantity: number }
  | {
      productId: string;
      status: "removed";
      reason: "missing" | "inactive" | "sold_out";
      previousQuantity: number;
    }
  | {
      productId: string;
      status: "adjusted";
      available: number;
      previousQuantity: number;
      quantity: number;
    };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { items?: BodyItem[] };
    const items = body.items ?? [];
    if (!items.length) {
      return NextResponse.json({ lines: [], removed: [], adjusted: [] });
    }

    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId || !Number.isFinite(it.quantity) || it.quantity < 1) {
        continue;
      }
      qtyByProduct.set(
        it.productId,
        (qtyByProduct.get(it.productId) ?? 0) + it.quantity
      );
    }

    const productIds = Array.from(qtyByProduct.keys());
    if (productIds.length === 0) {
      return NextResponse.json({ lines: [], removed: [], adjusted: [] });
    }

    const admin = createAdminClient();
    const { data: products, error: pErr } = await admin
      .from("products")
      .select("*")
      .in("id", productIds);

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const byId = new Map((products ?? []).map((p: Product) => [p.id, p]));

    const lines: CartValidateLineResult[] = [];
    const removed: string[] = [];
    const adjusted: string[] = [];

    for (const [productId, requestedQty] of Array.from(qtyByProduct.entries())) {
      const p = byId.get(productId);

      if (!p) {
        lines.push({
          productId,
          status: "removed",
          reason: "missing",
          previousQuantity: requestedQty,
        });
        removed.push(productId);
        continue;
      }

      const available = p.stock;
      if (!isProductOrderable(p)) {
        lines.push({
          productId,
          status: "removed",
          reason: p.status !== "ATIVO" ? "inactive" : "sold_out",
          previousQuantity: requestedQty,
        });
        removed.push(productId);
        continue;
      }

      if (requestedQty > available) {
        lines.push({
          productId,
          status: "adjusted",
          available,
          previousQuantity: requestedQty,
          quantity: available,
        });
        adjusted.push(productId);
        continue;
      }

      lines.push({
        productId,
        status: "ok",
        available,
        quantity: requestedQty,
      });
    }

    const refreshedProducts = (products ?? []).map((p: Product) => ({
      id: p.id,
      drive_file_id: p.drive_file_id,
      brand: p.brand,
      color: p.color,
      size: p.size,
      stock: p.stock,
      status: p.status,
      category: p.category ?? null,
      sku: p.sku,
      original_file_name: p.original_file_name,
      drive_image_url: productPublicImageUrl(p),
    }));

    return NextResponse.json({
      lines,
      removed,
      adjusted,
      products: refreshedProducts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
