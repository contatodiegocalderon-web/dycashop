import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import { getDriveRootFolderId } from "@/lib/drive-config";
import {
  resolveCredentialFilePath,
} from "@/lib/google-drive-auth";

/**
 * GET /api/health/drive
 * Testa OAuth ou conta de serviço + acesso à pasta configurada.
 */
export async function GET(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  const pathHint = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  const pathResolved = pathHint
    ? resolveCredentialFilePath(pathHint)
    : null;

  try {
    const auth = await getDriveAuth();
    await ensureDriveAuthorized(auth);
    const drive = google.drive({ version: "v3", auth });
    const about = await drive.about.get({
      fields: "user(emailAddress,permissionId)",
    });

    const rootId = await getDriveRootFolderId();
    let rootFolder:
      | { id?: string | null; name?: string | null; mimeType?: string | null }
      | undefined;
    let rootError: string | undefined;

    if (rootId) {
      try {
        const file = await drive.files.get({
          fileId: rootId,
          fields: "id,name,mimeType",
          supportsAllDrives: true,
        });
        rootFolder = file.data;
      } catch (err) {
        rootError =
          err instanceof Error ? err.message : "Erro ao ler pasta raiz";
      }
    }

    const oauthMode =
      !!process.env.GOOGLE_CLIENT_ID?.trim() &&
      !!process.env.GOOGLE_CLIENT_SECRET?.trim();

    return NextResponse.json({
      ok: true,
      mode: oauthMode ? "oauth_or_fallback" : "service_account_env",
      credentialsPathConfigured: !!pathHint,
      credentialsPathResolved: !!pathResolved,
      driveUserEmail: about.data.user?.emailAddress ?? null,
      driveApi: "ok",
      rootFolderId: rootId || null,
      rootFolder,
      rootFolderError: rootError,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        credentialsPathConfigured: !!pathHint,
        credentialsPathResolved: !!pathResolved,
        hint:
          msg.includes("Credenciais Google") || msg.includes("OAuth")
            ? "Modo simples: defina GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET e conecte em /admin/configuracao. Modo avançado: GOOGLE_SERVICE_ACCOUNT_JSON_PATH."
            : pathHint && !pathResolved
              ? "GOOGLE_SERVICE_ACCOUNT_JSON_PATH não encontrado no disco."
              : undefined,
      },
      { status: 200 }
    );
  }
}
