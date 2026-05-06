import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { extractDriveFolderId } from "@/lib/drive-folder-url";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET: estado da configuração (sem tokens). */
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_settings")
    .select("drive_folder_id, google_refresh_token")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint:
          'Execute o SQL em supabase/schema.sql (tabela "catalog_settings").',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    driveFolderId: data?.drive_folder_id ?? null,
    googleConnected: !!data?.google_refresh_token?.trim(),
    oauthConfigured:
      !!process.env.GOOGLE_CLIENT_ID?.trim() &&
      !!process.env.GOOGLE_CLIENT_SECRET?.trim(),
  });
}

/** POST: guardar link da pasta e sincronizar produtos de imediato. */
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

  let body: { folderUrl?: string; syncOnly?: boolean; saveOnly?: boolean };
  try {
    body = (await request.json()) as {
      folderUrl?: string;
      syncOnly?: boolean;
      saveOnly?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const stream =
    request.nextUrl.searchParams.get("stream") === "1" ||
    request.nextUrl.searchParams.get("stream") === "true";

  const ndjsonHeaders = {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
  } as const;

  const admin = createAdminClient();

  if (body.syncOnly) {
    const { data: row } = await admin
      .from("catalog_settings")
      .select("drive_folder_id")
      .eq("id", 1)
      .maybeSingle();
    const id = row?.drive_folder_id?.trim();
    if (!id) {
      return NextResponse.json(
        { error: "Nenhuma pasta configurada. Cole o link primeiro." },
        { status: 400 }
      );
    }
    try {
      if (stream) {
        const { syncProductsFromDriveFolderStreaming } = await import(
          "@/services/drive-sync"
        );
        const streamBody = syncProductsFromDriveFolderStreaming(id);
        return new Response(streamBody, { headers: ndjsonHeaders });
      }
      const { syncProductsFromDriveFolder } = await import(
        "@/services/drive-sync"
      );
      const result = await syncProductsFromDriveFolder(id);
      return NextResponse.json({ folderId: id, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro na sincronização";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const folderUrl = body.folderUrl?.trim();
  if (!folderUrl) {
    return NextResponse.json(
      { error: "folderUrl é obrigatório" },
      { status: 400 }
    );
  }

  const folderId = extractDriveFolderId(folderUrl);
  if (!folderId) {
    return NextResponse.json(
      {
        error:
          "Não foi possível ler o ID da pasta. Cole o link completo da pasta do Drive (ex.: …/folders/ABC…).",
      },
      { status: 400 }
    );
  }

  const { data: existing } = await admin
    .from("catalog_settings")
    .select("google_refresh_token")
    .eq("id", 1)
    .maybeSingle();

  const { error: saveError } = await admin.from("catalog_settings").upsert(
    {
      id: 1,
      drive_folder_id: folderId,
      google_refresh_token: existing?.google_refresh_token ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (saveError) {
    return NextResponse.json(
      {
        error: saveError.message,
        hint:
          'Confirme que a tabela catalog_settings existe (SQL em supabase/schema.sql).',
      },
      { status: 500 }
    );
  }

  if (body.saveOnly) {
    return NextResponse.json({
      saved: true,
      folderId,
      message: "Link da pasta guardado com sucesso.",
    });
  }

  try {
    if (stream) {
      const { syncProductsFromDriveFolderStreaming } = await import(
        "@/services/drive-sync"
      );
      const streamBody = syncProductsFromDriveFolderStreaming(folderId);
      return new Response(streamBody, { headers: ndjsonHeaders });
    }
    const { syncProductsFromDriveFolder } = await import(
      "@/services/drive-sync"
    );
    const result = await syncProductsFromDriveFolder(folderId);
    return NextResponse.json({
      saved: true,
      folderId,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na sincronização";
    return NextResponse.json(
      {
        saved: true,
        folderId,
        error: msg,
        hint:
          msg.includes("Credenciais") || msg.includes("OAuth")
            ? 'Use "Conectar Google" na página de configuração ou configure conta de serviço no .env.'
            : undefined,
      },
      { status: 500 }
    );
  }
}
