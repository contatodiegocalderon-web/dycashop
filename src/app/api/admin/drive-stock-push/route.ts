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
    const admin = createAdminClient();
    const { data: rows, error } = await admin.from("products").select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const productIds = (rows ?? [])
      .map((r) => String((r as { id?: string }).id ?? "").trim())
      .filter(Boolean);

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

