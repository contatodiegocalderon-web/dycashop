import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sortHomeBanners,
  type HomeBanner,
  type HomeBannerVariant,
} from "@/lib/home-banners";
import { CATALOG_STORAGE_BUCKET } from "@/lib/storage-constants";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;

async function requireOwner(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
    return null;
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }
}

async function processImage(
  file: Blob,
  variant: HomeBannerVariant
): Promise<Buffer> {
  const buf = Buffer.from(await file.arrayBuffer());
  const maxW = variant === "mobile" ? 1080 : 1600;
  return sharp(buf)
    .rotate()
    .resize({
      width: maxW,
      withoutEnlargement: true,
    })
    .jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

async function uploadJpeg(
  admin: ReturnType<typeof createAdminClient>,
  jpeg: Buffer,
  variant: HomeBannerVariant
): Promise<{ path: string; publicUrl: string }> {
  const path = `home-banners/${variant}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await admin.storage
    .from(CATALOG_STORAGE_BUCKET)
    .upload(path, jpeg, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = admin.storage
    .from(CATALOG_STORAGE_BUCKET)
    .getPublicUrl(path);
  if (!pub.publicUrl) throw new Error("URL pública indisponível.");
  return { path, publicUrl: pub.publicUrl };
}

function parseVariant(raw: string): HomeBannerVariant {
  return raw === "mobile" ? "mobile" : "desktop";
}

/** GET — lista todos (ativos e inativos) para o admin. */
export async function GET(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("home_banners")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    banners: sortHomeBanners((data ?? []) as HomeBanner[]),
  });
}

/**
 * POST multipart:
 * - Novo banner: file (desktop), file_mobile? (opcional), href?
 * - Atualizar imagem: id, variant=desktop|mobile, file
 */
export async function POST(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const existingId = String(form.get("id") ?? "").trim();
    const variant = parseVariant(String(form.get("variant") ?? "desktop"));
    const file = form.get("file");
    const fileMobile = form.get("file_mobile");
    const hrefRaw = String(form.get("href") ?? "").trim();
    const href = hrefRaw || null;

    const admin = createAdminClient();

    // Atualiza só uma variante de um banner existente
    if (existingId) {
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

      const { data: row, error: gErr } = await admin
        .from("home_banners")
        .select("*")
        .eq("id", existingId)
        .maybeSingle();
      if (gErr) {
        return NextResponse.json({ error: gErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json(
          { error: "Banner não encontrado." },
          { status: 404 }
        );
      }

      const jpeg = await processImage(file, variant);
      const uploaded = await uploadJpeg(admin, jpeg, variant);
      const oldPath =
        variant === "mobile"
          ? (row as HomeBanner).storage_path_mobile
          : (row as HomeBanner).storage_path;

      const patch =
        variant === "mobile"
          ? {
              image_url_mobile: uploaded.publicUrl,
              storage_path_mobile: uploaded.path,
              updated_at: new Date().toISOString(),
            }
          : {
              image_url: uploaded.publicUrl,
              storage_path: uploaded.path,
              updated_at: new Date().toISOString(),
            };

      const { data: updated, error: uErr } = await admin
        .from("home_banners")
        .update(patch)
        .eq("id", existingId)
        .select("*")
        .single();
      if (uErr) {
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }

      if (oldPath && oldPath !== uploaded.path) {
        await admin.storage.from(CATALOG_STORAGE_BUCKET).remove([oldPath]);
      }

      return NextResponse.json({
        ok: true,
        banner: updated as HomeBanner,
        variant,
      });
    }

    // Novo banner (desktop obrigatório)
    if (!(file instanceof Blob) || file.size < 1) {
      return NextResponse.json(
        { error: "Envie a imagem para computador (desktop)." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Imagem desktop demasiado grande (máx. 6 MB)." },
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

    const desktopJpeg = await processImage(file, "desktop");
    const desktopUp = await uploadJpeg(admin, desktopJpeg, "desktop");

    let mobileUrl: string | null = null;
    let mobilePath: string | null = null;
    if (fileMobile instanceof Blob && fileMobile.size > 0) {
      if (fileMobile.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Imagem celular demasiado grande (máx. 6 MB)." },
          { status: 400 }
        );
      }
      const mMime = (fileMobile.type || "").toLowerCase();
      if (
        mMime !== "image/jpeg" &&
        mMime !== "image/png" &&
        mMime !== "image/webp"
      ) {
        return NextResponse.json(
          { error: "Celular: use JPEG, PNG ou WebP." },
          { status: 400 }
        );
      }
      const mobileJpeg = await processImage(fileMobile, "mobile");
      const mobileUp = await uploadJpeg(admin, mobileJpeg, "mobile");
      mobileUrl = mobileUp.publicUrl;
      mobilePath = mobileUp.path;
    }

    const { data: existing } = await admin
      .from("home_banners")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder =
      existing && existing.length > 0
        ? Number(existing[0].sort_order ?? 0) + 1
        : 0;

    const { data: row, error: insErr } = await admin
      .from("home_banners")
      .insert({
        image_url: desktopUp.publicUrl,
        storage_path: desktopUp.path,
        image_url_mobile: mobileUrl,
        storage_path_mobile: mobilePath,
        href,
        sort_order: nextOrder,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, banner: row as HomeBanner });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

/**
 * PATCH JSON:
 * - { id, active?: boolean, href?: string | null }
 * - { id, direction: "up" | "down" }
 * - { orderedIds: string[] }
 * - { id, clearMobile: true }
 */
export async function PATCH(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      id?: string;
      active?: boolean;
      href?: string | null;
      direction?: "up" | "down";
      orderedIds?: string[];
      clearMobile?: boolean;
    };

    const admin = createAdminClient();

    if (Array.isArray(body.orderedIds) && body.orderedIds.length > 0) {
      for (let i = 0; i < body.orderedIds.length; i++) {
        const id = String(body.orderedIds[i] ?? "").trim();
        if (!id) continue;
        const { error } = await admin
          .from("home_banners")
          .update({
            sort_order: i,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Informe id." }, { status: 400 });
    }

    if (body.clearMobile) {
      const { data: row } = await admin
        .from("home_banners")
        .select("storage_path_mobile")
        .eq("id", id)
        .maybeSingle();
      const path = (row as { storage_path_mobile?: string | null } | null)
        ?.storage_path_mobile;
      const { data, error } = await admin
        .from("home_banners")
        .update({
          image_url_mobile: null,
          storage_path_mobile: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (path) {
        await admin.storage.from(CATALOG_STORAGE_BUCKET).remove([path]);
      }
      return NextResponse.json({ ok: true, banner: data as HomeBanner });
    }

    if (body.direction === "up" || body.direction === "down") {
      const { data: rows, error } = await admin
        .from("home_banners")
        .select("id, sort_order")
        .order("sort_order", { ascending: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const list = sortHomeBanners((rows ?? []) as HomeBanner[]);
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: "Banner não encontrado." }, { status: 404 });
      }
      const swapWith = body.direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= list.length) {
        return NextResponse.json({ ok: true, unchanged: true });
      }
      const a = list[idx]!;
      const b = list[swapWith]!;
      const now = new Date().toISOString();
      const { error: e1 } = await admin
        .from("home_banners")
        .update({ sort_order: b.sort_order, updated_at: now })
        .eq("id", a.id);
      const { error: e2 } = await admin
        .from("home_banners")
        .update({ sort_order: a.sort_order, updated_at: now })
        .eq("id", b.id);
      if (e1 || e2) {
        return NextResponse.json(
          { error: (e1 ?? e2)!.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.active === "boolean") patch.active = body.active;
    if ("href" in body) {
      const h = body.href == null ? null : String(body.href).trim() || null;
      patch.href = h;
    }

    const { data, error: uErr } = await admin
      .from("home_banners")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Banner não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, banner: data as HomeBanner });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

/** DELETE ?id= */
export async function DELETE(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Informe id." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row, error: gErr } = await admin
      .from("home_banners")
      .select("id, storage_path, storage_path_mobile")
      .eq("id", id)
      .maybeSingle();

    if (gErr) {
      return NextResponse.json({ error: gErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Banner não encontrado." }, { status: 404 });
    }

    const paths = [
      (row as { storage_path?: string | null }).storage_path?.trim(),
      (row as { storage_path_mobile?: string | null }).storage_path_mobile?.trim(),
    ].filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      await admin.storage.from(CATALOG_STORAGE_BUCKET).remove(paths);
    }

    const { error: dErr } = await admin.from("home_banners").delete().eq("id", id);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
