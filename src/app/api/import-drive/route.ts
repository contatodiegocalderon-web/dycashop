import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { getDriveRootFolderId } from "@/lib/drive-config";
import {
  syncProductsFromDriveFolder,
  syncProductsFromDriveFolderStreaming,
} from "@/services/drive-sync";

/**
 * POST /api/import-drive
 * Header: x-admin-key
 * Sincroniza arquivos das subpastas M, G, GG do Google Drive para `products`.
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

  const stream =
    request.nextUrl.searchParams.get("stream") === "1" ||
    request.nextUrl.searchParams.get("stream") === "true";

  const rootId = await getDriveRootFolderId();
  if (!rootId) {
    return NextResponse.json(
      {
        error:
          "Pasta do Drive não configurada. Em /admin/configuracao cole o link da pasta ou defina GOOGLE_DRIVE_ROOT_FOLDER_ID no .env.",
      },
      { status: 500 }
    );
  }

  try {
    if (stream) {
      const body = syncProductsFromDriveFolderStreaming(rootId);
      return new Response(body, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await syncProductsFromDriveFolder(rootId);
    if ("message" in result && result.imported === 0) {
      return NextResponse.json(result);
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na importação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
