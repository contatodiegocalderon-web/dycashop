import { NextRequest, NextResponse } from "next/server";
import { assertAdmin, assertOwnerAccess } from "@/lib/admin-auth";
import {
  DEFAULT_SHOWCASE,
  sanitizeRetailPrice,
  sanitizeWholesaleTiers,
  type WholesaleTier,
} from "@/lib/category-showcase";
import {
  categoryLookupKey,
  resolveDisplayOrderForUpsert,
} from "@/lib/catalog-categories";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";

export const runtime = "nodejs";
const PAGE_SIZE = 1000;

type ShowcaseRow = {
  category_label: string;
  video_url: string | null;
  video_poster_url: string | null;
  wholesale_tiers: WholesaleTier[];
  retail_price: number | null;
  /** Cartão na grelha da página inicial */
  home_grid_cover_image_url: string | null;
  /** Banner ao abrir a categoria */
  catalog_cover_image_url: string | null;
  display_order: number | null;
};

async function loadCatalogCategoryLabels(admin: ReturnType<typeof createAdminClient>) {
  const labels = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await admin
      .from("products")
      .select("category")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { category: string | null }[];
    for (const row of chunk) {
      const label =
        row.category != null && String(row.category).trim() !== ""
          ? String(row.category).trim()
          : "Sem categoria";
      labels.add(label);
    }
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  if (labels.size === 0) labels.add("Sem categoria");
  return Array.from(labels).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function mapShowcaseRaw(row: Record<string, unknown>): ShowcaseRow {
  const label = String(row.category_label ?? "").trim();
  return {
    category_label: label,
    video_url: String(row.video_url ?? "").trim() || null,
    video_poster_url: String(row.video_poster_url ?? "").trim() || null,
    wholesale_tiers: sanitizeWholesaleTiers(row.wholesale_tiers),
    retail_price: sanitizeRetailPrice(row.retail_price),
    home_grid_cover_image_url:
      String(row.home_grid_cover_image_url ?? "").trim() || null,
    catalog_cover_image_url:
      String(row.catalog_cover_image_url ?? "").trim() || null,
    display_order:
      typeof row.display_order === "number" ? row.display_order : null,
  };
}

async function fetchShowcaseRows(admin: ReturnType<typeof createAdminClient>) {
  const withRetail = await admin.from("category_showcase_settings").select(
    "category_label, video_url, video_poster_url, wholesale_tiers, retail_price, catalog_cover_image_url, home_grid_cover_image_url, display_order"
  );
  if (!withRetail.error) return withRetail.data ?? [];

  if (
    isMissingSchemaColumnError(withRetail.error) &&
    /retail_price/i.test(withRetail.error.message ?? "")
  ) {
    const full = await admin.from("category_showcase_settings").select(
      "category_label, video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url, home_grid_cover_image_url, display_order"
    );
    if (!full.error) {
      return (full.data ?? []).map((row) => ({ ...row, retail_price: null }));
    }
    if (!isMissingSchemaColumnError(full.error)) {
      throw new Error(full.error.message);
    }
  } else if (!isMissingSchemaColumnError(withRetail.error)) {
    throw new Error(withRetail.error.message);
  }

  const mid = await admin.from("category_showcase_settings").select(
    "category_label, video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url, display_order"
  );
  if (!mid.error) {
    return (mid.data ?? []).map((row) => ({
      ...row,
      retail_price: null,
      home_grid_cover_image_url: null,
    }));
  }
  if (!isMissingSchemaColumnError(mid.error)) {
    throw new Error(mid.error.message);
  }
  const base = await admin
    .from("category_showcase_settings")
    .select("category_label, video_url, video_poster_url, wholesale_tiers");
  if (base.error) throw new Error(base.error.message);
  return (base.data ?? []).map((row) => ({
    ...row,
    retail_price: null,
    catalog_cover_image_url: null,
    home_grid_cover_image_url: null,
    display_order: null,
  }));
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
    const labels = await loadCatalogCategoryLabels(admin);
    const data = await fetchShowcaseRows(admin);
    const mapExact = new Map<string, ShowcaseRow>();
    const mapNormalized = new Map<string, ShowcaseRow>();
    for (const row of data ?? []) {
      const label = String(
        (row as { category_label?: string }).category_label ?? ""
      ).trim();
      if (!label) continue;
      const parsed = mapShowcaseRaw(row as Record<string, unknown>);
      mapExact.set(label, parsed);
      const nk = categoryLookupKey(label);
      if (!mapNormalized.has(nk)) mapNormalized.set(nk, parsed);
    }
    const rows = labels.map((category_label) => {
      const found =
        mapExact.get(category_label) ??
        mapNormalized.get(categoryLookupKey(category_label));
      return (
        found ?? {
          category_label,
          video_url: null,
          video_poster_url: null,
          wholesale_tiers: DEFAULT_SHOWCASE.wholesaleTiers,
          retail_price: null,
          home_grid_cover_image_url: null,
          catalog_cover_image_url: null,
          display_order: null,
        }
      );
    });
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
    const body = (await request.json()) as {
      entries?: {
        category_label: string;
        video_url?: string | null;
        video_poster_url?: string | null;
        wholesale_tiers?: unknown;
        retail_price?: unknown;
        home_grid_cover_image_url?: string | null;
        catalog_cover_image_url?: string | null;
        display_order?: number | null;
      }[];
    };
    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json(
        { error: "Informe entries com category_label." },
        { status: 400 }
      );
    }
    const admin = createAdminClient();
    const labels = body.entries.map((raw) => String(raw.category_label ?? "").trim());
    const existingByLabel = new Map<string, number | null>();
    if (labels.some(Boolean)) {
      const existingRows = await fetchShowcaseRows(admin);
      for (const row of existingRows) {
        const label = String(
          (row as { category_label?: string }).category_label ?? ""
        ).trim();
        if (!label) continue;
        const ord = (row as { display_order?: number | null }).display_order;
        existingByLabel.set(
          label,
          typeof ord === "number" && Number.isFinite(ord) ? ord : null
        );
      }
    }

    const entries = body.entries.map((raw) => {
      const category_label = String(raw.category_label ?? "").trim();
      if (!category_label) throw new Error("Categoria inválida.");
      const incomingOrder =
        raw.display_order != null && Number.isFinite(Number(raw.display_order))
          ? Number(raw.display_order)
          : null;
      return {
        category_label,
        video_url: raw.video_url?.trim() || null,
        video_poster_url: raw.video_poster_url?.trim() || null,
        wholesale_tiers: sanitizeWholesaleTiers(raw.wholesale_tiers),
        retail_price: sanitizeRetailPrice(raw.retail_price),
        home_grid_cover_image_url: raw.home_grid_cover_image_url?.trim() || null,
        catalog_cover_image_url: raw.catalog_cover_image_url?.trim() || null,
        display_order: resolveDisplayOrderForUpsert(
          incomingOrder,
          existingByLabel.get(category_label)
        ),
      };
    });
    const { error } = await admin.from("category_showcase_settings").upsert(entries, {
      onConflict: "category_label",
    });
    if (error) {
      const hint = /retail_price/i.test(error.message)
        ? "Execute o SQL em supabase/migration_category_retail_price.sql no painel do Supabase."
        : undefined;
      return NextResponse.json(
        { error: error.message, ...(hint ? { hint } : {}) },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
