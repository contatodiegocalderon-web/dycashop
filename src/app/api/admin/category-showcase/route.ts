import { NextRequest, NextResponse } from "next/server";
import { assertAdmin, assertOwnerAccess } from "@/lib/admin-auth";
import {
  DEFAULT_SHOWCASE,
  sanitizeWholesaleTiers,
  type WholesaleTier,
} from "@/lib/category-showcase";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";

export const runtime = "nodejs";
const PAGE_SIZE = 1000;

type ShowcaseRow = {
  category_label: string;
  video_url: string | null;
  video_poster_url: string | null;
  wholesale_tiers: WholesaleTier[];
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

async function fetchShowcaseRows(admin: ReturnType<typeof createAdminClient>) {
  const full = await admin.from("category_showcase_settings").select(
    "category_label, video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url, home_grid_cover_image_url, display_order"
  );
  if (!full.error) return full.data ?? [];
  if (!isMissingSchemaColumnError(full.error)) {
    throw new Error(full.error.message);
  }
  const mid = await admin.from("category_showcase_settings").select(
    "category_label, video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url, display_order"
  );
  if (!mid.error) {
    return (mid.data ?? []).map((row) => ({
      ...row,
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
    const map = new Map<string, ShowcaseRow>();
    for (const row of data ?? []) {
      const label = String(row.category_label ?? "").trim();
      if (!label) continue;
      const r = row as {
        category_label?: string;
        video_url?: string | null;
        video_poster_url?: string | null;
        wholesale_tiers?: unknown;
        catalog_cover_image_url?: string | null;
        home_grid_cover_image_url?: string | null;
        display_order?: number | null;
      };
      map.set(label, {
        category_label: label,
        video_url: r.video_url?.trim() || null,
        video_poster_url: r.video_poster_url?.trim() || null,
        wholesale_tiers: sanitizeWholesaleTiers(r.wholesale_tiers),
        home_grid_cover_image_url: r.home_grid_cover_image_url?.trim() || null,
        catalog_cover_image_url: r.catalog_cover_image_url?.trim() || null,
        display_order:
          typeof r.display_order === "number" ? r.display_order : null,
      });
    }
    const rows = labels.map((category_label) => {
      const found = map.get(category_label);
      return (
        found ?? {
          category_label,
          video_url: null,
          video_poster_url: null,
          wholesale_tiers: DEFAULT_SHOWCASE.wholesaleTiers,
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
    const entries = body.entries.map((raw) => {
      const category_label = String(raw.category_label ?? "").trim();
      if (!category_label) throw new Error("Categoria inválida.");
      return {
        category_label,
        video_url: raw.video_url?.trim() || null,
        video_poster_url: raw.video_poster_url?.trim() || null,
        wholesale_tiers: sanitizeWholesaleTiers(raw.wholesale_tiers),
        home_grid_cover_image_url: raw.home_grid_cover_image_url?.trim() || null,
        catalog_cover_image_url: raw.catalog_cover_image_url?.trim() || null,
        display_order:
          raw.display_order != null && Number.isFinite(Number(raw.display_order))
            ? Number(raw.display_order)
            : null,
      };
    });
    const admin = createAdminClient();
    const { error } = await admin.from("category_showcase_settings").upsert(entries, {
      onConflict: "category_label",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
