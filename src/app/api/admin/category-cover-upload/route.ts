import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { DEFAULT_SHOWCASE } from "@/lib/category-showcase";
import { resolveDisplayOrderForUpsert } from "@/lib/catalog-categories";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";
import { CATALOG_STORAGE_BUCKET } from "@/lib/storage-constants";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;

/** `home_grid` = cartão na página inicial; `category_page` = banner em /categoria */
export type CoverKind = "home_grid" | "category_page";

function safeLabelSegment(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "categoria";
}

type ExistingShowcase = {
  video_url?: string | null;
  video_poster_url?: string | null;
  wholesale_tiers?: unknown;
  display_order?: number | null;
  catalog_cover_image_url?: string | null;
  home_grid_cover_image_url?: string | null;
};

async function upsertCoverUrl(
  admin: ReturnType<typeof createAdminClient>,
  categoryLabel: string,
  url: string | null,
  kind: CoverKind
) {
  let hasHomeGridColumn = true;
  let sel = await admin
    .from("category_showcase_settings")
    .select(
      "video_url, video_poster_url, wholesale_tiers, display_order, catalog_cover_image_url, home_grid_cover_image_url"
    )
    .eq("category_label", categoryLabel)
    .maybeSingle();

  if (sel.error && isMissingSchemaColumnError(sel.error)) {
    hasHomeGridColumn = false;
    sel = await admin
      .from("category_showcase_settings")
      .select(
        "video_url, video_poster_url, wholesale_tiers, display_order, catalog_cover_image_url"
      )
      .eq("category_label", categoryLabel)
      .maybeSingle();
  }

  if (sel.error) throw new Error(sel.error.message);

  if (!hasHomeGridColumn && kind === "home_grid") {
    throw new Error(
      "Execute o SQL em supabase/migration_home_grid_cover_split.sql no Supabase."
    );
  }

  const ex = (sel.data as ExistingShowcase | null) ?? null;

  let catalog: string | null;
  let grid: string | null;
  if (!ex) {
    catalog = kind === "category_page" ? url : null;
    grid = kind === "home_grid" ? url : null;
  } else {
    catalog =
      kind === "category_page"
        ? url
        : ex.catalog_cover_image_url?.trim() || null;
    grid =
      kind === "home_grid"
        ? url
        : ex.home_grid_cover_image_url?.trim() || null;
  }

  const payload: Record<string, unknown> = {
    category_label: categoryLabel,
    video_url: ex?.video_url ?? null,
    video_poster_url: ex?.video_poster_url ?? null,
    wholesale_tiers:
      ex?.wholesale_tiers ?? DEFAULT_SHOWCASE.wholesaleTiers,
    catalog_cover_image_url: catalog,
  };

  payload.display_order = resolveDisplayOrderForUpsert(
    undefined,
    ex?.display_order
  );

  if (hasHomeGridColumn) {
    payload.home_grid_cover_image_url = grid;
  }

  const { error } = await admin
    .from("category_showcase_settings")
    .upsert(payload, { onConflict: "category_label" });
  if (error) throw new Error(error.message);
}

/** POST multipart: category_label, cover_kind (home_grid | category_page), file */
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
    const categoryLabel = String(form.get("category_label") ?? "").trim();
    const kindRaw = String(form.get("cover_kind") ?? "category_page").trim();
    const kind: CoverKind =
      kindRaw === "home_grid" ? "home_grid" : "category_page";
    const file = form.get("file");
    if (!categoryLabel) {
      return NextResponse.json(
        { error: "category_label obrigatório." },
        { status: 400 }
      );
    }
    if (!(file instanceof Blob) || file.size < 1) {
      return NextResponse.json({ error: "Ficheiro inválido." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Imagem demasiado grande (máx. 6 MB)." },
        { status: 400 }
      );
    }

    const mime = (file.type || "").toLowerCase();
    if (
      mime !== "image/jpeg" &&
      mime !== "image/png" &&
      mime !== "image/webp"
    ) {
      return NextResponse.json(
        { error: "Use JPEG, PNG ou WebP." },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const jpeg = await sharp(buf)
      .rotate()
      .resize({
        width: 1920,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();

    const admin = createAdminClient();
    const segment = safeLabelSegment(categoryLabel);
    const sub =
      kind === "home_grid" ? "grid" : "category-page";
    const path = `category-covers/${sub}/${segment}-${crypto.randomUUID()}.jpg`;

    const { error: upErr } = await admin.storage
      .from(CATALOG_STORAGE_BUCKET)
      .upload(path, jpeg, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: pub } = admin.storage
      .from(CATALOG_STORAGE_BUCKET)
      .getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    if (!publicUrl) {
      return NextResponse.json(
        { error: "URL pública indisponível." },
        { status: 500 }
      );
    }

    await upsertCoverUrl(admin, categoryLabel, publicUrl, kind);

    return NextResponse.json({ ok: true, url: publicUrl, cover_kind: kind });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

/** Remover capa: ?category_label=...&cover_kind=home_grid|category_page */
export async function DELETE(request: NextRequest) {
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
    const categoryLabel = request.nextUrl.searchParams
      .get("category_label")
      ?.trim();
    const kindRaw =
      request.nextUrl.searchParams.get("cover_kind") ?? "category_page";
    const kind: CoverKind =
      kindRaw === "home_grid" ? "home_grid" : "category_page";

    if (!categoryLabel) {
      return NextResponse.json(
        { error: "category_label obrigatório." },
        { status: 400 }
      );
    }
    const admin = createAdminClient();
    await upsertCoverUrl(admin, categoryLabel, null, kind);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
