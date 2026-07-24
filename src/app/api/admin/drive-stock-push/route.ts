import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renameDriveFilesToCurrentStock } from "@/services/drive-rename-stock";

export const runtime = "nodejs";

/** POST: aplica stock atual da app nos nomes dos ficheiros do Drive (todos os produtos). */
export async function POST(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    let bodyProductIds: string[] | null = null;
    try {
      const body = (await request.json()) as { productIds?: unknown };
      if (Array.isArray(body?.productIds)) {
        bodyProductIds = body.productIds
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
      }
    } catch {
      bodyProductIds = null;
    }

    const admin = createAdminClient();
    let productIds = bodyProductIds;
    if (!productIds?.length) {
      const { data: rows, error } = await admin.from("products").select("id");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      productIds = (rows ?? [])
        .map((r) => String((r as { id?: string }).id ?? "").trim())
        .filter(Boolean);
    }

    const rename = await renameDriveFilesToCurrentStock(productIds);

    return NextResponse.json({
      ok: true,
      totalProducts: productIds.length,
      renamed: rename.ok.length,
      errors: rename.errors,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    );
  }
}

