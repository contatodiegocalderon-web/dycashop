import { NextRequest, NextResponse } from "next/server";
import { getDriveRootFolderId } from "@/lib/drive-config";
import { syncProductsFromDriveFolder } from "@/services/drive-sync";

export const runtime = "nodejs";
/** Vercel: alargar se o catálogo for muito grande (plano Pro). */
export const maxDuration = 300;

function verifyCron(
  request: NextRequest
): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message:
        "CRON_SECRET não definido. Adicione no ambiente (Vercel → Settings → Environment Variables).",
    };
  }
  const h = request.headers.get("authorization");
  if (h !== `Bearer ${secret}`) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true };
}

/**
 * GET /api/cron/daily-catalog-sync
 * Job diário (Vercel Cron ou curl manual).
 * Corre `syncProductsFromDriveFolder` com stock preservado na BD: importa fotos novas,
 * remove produtos cujo ficheiro sumiu do Drive, sincroniza imagens para Storage e, no fim,
 * renomeia no Drive cada ficheiro para «MARCA COR N» conforme stock na app (ver drive-sync).
 *
 * Segurança: Authorization: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const auth = verifyCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  const rootId = await getDriveRootFolderId();
  if (!rootId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Pasta raiz do Drive não configurada (admin ou GOOGLE_DRIVE_ROOT_FOLDER_ID).",
      },
      { status: 400 }
    );
  }

  const syncResult = await syncProductsFromDriveFolder(rootId, {
    preserveExistingStock: true,
  });

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    imported: syncResult.imported,
    totalParsed: syncResult.totalParsed,
    removedMissingFromDrive: syncResult.removedMissingFromDrive,
    storageUploaded: syncResult.storageUploaded,
    storageSkipped: syncResult.storageSkipped,
    storageErrorCount: syncResult.storageErrors?.length ?? 0,
    storageErrors: (syncResult.storageErrors ?? []).slice(0, 30),
    driveRenameOk: syncResult.driveRenameOk,
    driveRenameErrorCount: syncResult.driveRenameErrors?.length ?? 0,
    driveRenameErrorsSample: (syncResult.driveRenameErrors ?? []).slice(0, 5),
  });
}
