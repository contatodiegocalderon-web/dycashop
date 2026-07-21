import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { fetchAllProductsPaginated } from "@/lib/fetch-all-products";
import {
  aggregateStockInventory,
  type ProductStockRow,
} from "@/lib/stock-inventory";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stock-inventory
 * Só dono ou chave API. Peças = soma do stock de cada produto no catálogo (atualiza após import Drive).
 */
export async function GET(request: NextRequest) {
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
    const all = await fetchAllProductsPaginated<ProductStockRow>(
      admin,
      "category, size, stock, status, updated_at"
    );

    const snapshot = aggregateStockInventory(all);

    const { data: settings } = await admin
      .from("catalog_settings")
      .select("updated_at, catalog_synced_at")
      .eq("id", 1)
      .maybeSingle();

    const settingsRow = settings as {
      updated_at?: string;
      catalog_synced_at?: string | null;
    } | null;

    return NextResponse.json(
      {
        ...snapshot,
        driveSettingsUpdatedAt: settingsRow?.updated_at ?? null,
        catalogSyncedAt: settingsRow?.catalog_synced_at ?? null,
        productRows: all.length,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
