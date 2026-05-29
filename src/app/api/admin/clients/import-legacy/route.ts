import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { importLegacyClients } from "@/lib/crm-legacy-import-service";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clients/import-legacy
 * Multipart: file (.xlsx ou .xls)
 */
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
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Envie o ficheiro no campo «file»." },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Excel sem folhas." }, { status: 400 });
    }
    const sheet = wb.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });
    }

    const admin = createAdminClient();
    const stats = await importLegacyClients(admin, rows);

    return NextResponse.json({
      ok: true,
      sheet: sheetName,
      stats,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na importação";
    if (/legacy_import|column/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Coluna legacy_import em falta. Execute supabase/migration_orders_legacy_import.sql no Supabase.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
