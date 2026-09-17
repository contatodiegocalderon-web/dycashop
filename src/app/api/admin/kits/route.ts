import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { assertAdmin } from "@/lib/admin-auth";
import {
  KITS_CATEGORY_LABEL,
  parseKitUnitPrice,
  parseKitWeightGrams,
} from "@/lib/kits-category";
import { productPublicImageUrl } from "@/lib/product-image-url";
import { CATALOG_STORAGE_BUCKET } from "@/lib/storage-constants";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;
const PAGE_SIZE = 500;

function skuFromId(id: string) {
  return `KIT-${id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

async function jpegFromUpload(file: Blob) {
  const mime = (file.type || "").toLowerCase();
  if (
    mime !== "image/jpeg" &&
    mime !== "image/png" &&
    mime !== "image/webp"
  ) {
    throw new Error("Use JPEG, PNG ou WebP.");
  }
  if (file.size < 1) throw new Error("Ficheiro inválido.");
  if (file.size > MAX_BYTES) {
    throw new Error("Imagem demasiado grande (máx. 6 MB).");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return sharp(buf)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

async function uploadKitImage(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  jpeg: Buffer
) {
  const path = `kits/${productId}-${crypto.randomUUID()}.jpg`;
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
  return pub.publicUrl;
}

function mapKitRow(row: Record<string, unknown>) {
  const drive_file_id = String(row.drive_file_id ?? "");
  return {
    ...row,
    category: KITS_CATEGORY_LABEL,
    drive_image_url: productPublicImageUrl({
      drive_file_id,
      image_url: (row.image_url as string | null) ?? null,
      catalog_image_url: (row.catalog_image_url as string | null) ?? null,
    }),
  };
}

export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const admin = createAdminClient();
    const rows: Record<string, unknown>[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await admin
        .from("products")
        .select("*")
        .eq("source", "admin")
        .eq("category", KITS_CATEGORY_LABEL)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return NextResponse.json(
      { kits: rows.map(mapKitRow) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const unitPrice = parseKitUnitPrice(form.get("price"));
    const weightGrams = parseKitWeightGrams(form.get("weight"));
    const stockRaw = Number(String(form.get("stock") ?? "1").replace(",", "."));
    const stock = Number.isFinite(stockRaw) ? Math.max(0, Math.floor(stockRaw)) : 1;
    const file = form.get("file");

    if (!title) {
      return NextResponse.json({ error: "Informe o título." }, { status: 400 });
    }
    if (!subtitle) {
      return NextResponse.json({ error: "Informe o subtítulo." }, { status: 400 });
    }
    if (unitPrice == null) {
      return NextResponse.json({ error: "Informe um preço válido." }, { status: 400 });
    }
    if (weightGrams == null) {
      return NextResponse.json(
        { error: "Informe o peso do kit em gramas." },
        { status: 400 }
      );
    }
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Envie a foto do kit." }, { status: 400 });
    }

    const jpeg = await jpegFromUpload(file);
    const admin = createAdminClient();
    const id = crypto.randomUUID();
    const driveFileId = `admin-kit-${id}`;
    const imageUrl = await uploadKitImage(admin, id, jpeg);
    const original = `${title} ${subtitle}`.slice(0, 180);

    const { data, error } = await admin
      .from("products")
      .insert({
        id,
        drive_file_id: driveFileId,
        drive_image_url: imageUrl,
        image_url: imageUrl,
        catalog_image_url: imageUrl,
        original_file_name: original,
        category: KITS_CATEGORY_LABEL,
        brand: title,
        color: subtitle,
        size: "M",
        stock,
        sku: skuFromId(id),
        status: stock > 0 ? "ATIVO" : "ESGOTADO",
        source: "admin",
        unit_price: unitPrice,
        weight_grams: weightGrams,
        sync_status: "done",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, kit: mapKitRow(data) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
    }

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const unitPrice = parseKitUnitPrice(form.get("price"));
    const hasWeightField = form.has("weight");
    const weightGrams = parseKitWeightGrams(form.get("weight"));
    const stockRaw = String(form.get("stock") ?? "").trim();
    const file = form.get("file");

    const admin = createAdminClient();
    const { data: existing, error: exErr } = await admin
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("source", "admin")
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      category: KITS_CATEGORY_LABEL,
      source: "admin",
    };
    if (title) patch.brand = title;
    if (subtitle) patch.color = subtitle;
    if (unitPrice != null) patch.unit_price = unitPrice;
    if (hasWeightField) {
      if (weightGrams == null) {
        return NextResponse.json(
          { error: "Informe o peso do kit em gramas." },
          { status: 400 }
        );
      }
      patch.weight_grams = weightGrams;
    }
    if (stockRaw !== "") {
      const stock = Math.max(0, Math.floor(Number(stockRaw.replace(",", "."))));
      if (!Number.isFinite(stock)) {
        return NextResponse.json({ error: "Estoque inválido." }, { status: 400 });
      }
      patch.stock = stock;
      patch.status = stock > 0 ? "ATIVO" : "ESGOTADO";
    }
    if (title || subtitle) {
      const nextTitle = title || String(existing.brand ?? "");
      const nextSub = subtitle || String(existing.color ?? "");
      patch.original_file_name = `${nextTitle} ${nextSub}`.slice(0, 180);
    }

    if (file instanceof Blob && file.size > 0) {
      const jpeg = await jpegFromUpload(file);
      const imageUrl = await uploadKitImage(admin, id, jpeg);
      patch.drive_image_url = imageUrl;
      patch.image_url = imageUrl;
      patch.catalog_image_url = imageUrl;
    }

    const { data, error } = await admin
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("source", "admin")
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, kit: mapKitRow(data) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("products")
      .delete()
      .eq("id", id)
      .eq("source", "admin");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
