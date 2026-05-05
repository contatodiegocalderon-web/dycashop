import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { DEFAULT_SHOWCASE } from "@/lib/category-showcase";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";
import { CATALOG_STORAGE_BUCKET } from "@/lib/storage-constants";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;

function safeLabelSegment(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "categoria";
}

async function upsertCoverUrl(
  admin: ReturnType<typeof createAdminClient>,
  categoryLabel: string,
  url: string | null
) {
  let sel = await admin
    .from("category_showcase_settings")
    .select(
      "video_url, video_poster_url, wholesale_tiers, display_order"
    )
    .eq("category_label", categoryLabel)
    .maybeSingle();

  if (sel.error && isMissingSchemaColumnError(sel.error)) {
    sel = await admin
      .from("category_showcase_settings")
      .select("video_url, video_poster_url, wholesale_tiers")
      .eq("category_label", categoryLabel)
      .maybeSingle();
  }

  if (sel.error) throw new Error(sel.error.message);

  const existing = sel.data as {
    video_url?: string | null;
    video_poster_url?: string | null;
    wholesale_tiers?: unknown;
    display_order?: number | null;
  } | null;

  const payload: Record<string, unknown> = {
    category_label: categoryLabel,
    video_url: existing?.video_url ?? null,
    video_poster_url: existing?.video_poster_url ?? null,
    wholesale_tiers:
      existing?.wholesale_tiers ?? DEFAULT_SHOWCASE.wholesaleTiers,
    catalog_cover_image_url: url,
  };

  if (
    existing &&
    typeof (existing as { display_order?: number }).display_order === "number"
  ) {
    payload.display_order = (existing as { display_order: number }).display_order;
  }

  const { error } = await admin
    .from("category_showcase_settings")
    .upsert(payload, { onConflict: "category_label" });
  if (error) throw new Error(error.message);
}

/** POST multipart: category_label + file (jpeg/png/webp) */
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
    const path = `category-covers/${segment}-${crypto.randomUUID()}.jpg`;

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

    await upsertCoverUrl(admin, categoryLabel, publicUrl);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

/** Remove capa: ?category_label=... */
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
    if (!categoryLabel) {
      return NextResponse.json(
        { error: "category_label obrigatório." },
        { status: 400 }
      );
    }
    const admin = createAdminClient();
    await upsertCoverUrl(admin, categoryLabel, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
