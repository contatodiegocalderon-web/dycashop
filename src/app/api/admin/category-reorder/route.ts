import { NextRequest, NextResponse } from "next/server";
import { assertOwnerAccess } from "@/lib/admin-auth";
import {
  DEFAULT_SHOWCASE,
  sanitizeWholesaleTiers,
  type WholesaleTier,
} from "@/lib/category-showcase";
import {
  categoryLookupKey,
  DISPLAY_ORDER_DEFAULT_SENTINEL,
  sortCategoryLabelsForCatalog,
} from "@/lib/catalog-categories";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;

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

type RowLite = {
  category_label: string;
  video_url: string | null;
  video_poster_url: string | null;
  wholesale_tiers: WholesaleTier[];
  home_grid_cover_image_url: string | null;
  catalog_cover_image_url: string | null;
  display_order: number | null;
};

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
    const body = (await request.json()) as {
      category_label?: string;
      direction?: "up" | "down";
    };
    const category_label = String(body.category_label ?? "").trim();
    const direction = body.direction;
    if (!category_label || (direction !== "up" && direction !== "down")) {
      return NextResponse.json(
        { error: "Informe category_label e direction: up | down." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const labels = await loadCatalogCategoryLabels(admin);

    let rows:
      | {
          category_label?: string | null;
          video_url?: string | null;
          video_poster_url?: string | null;
          wholesale_tiers?: unknown;
          catalog_cover_image_url?: string | null;
          home_grid_cover_image_url?: string | null;
          display_order?: number | null;
        }[]
      | null = null;
    let schemaHasHomeGrid = true;

    const fullSel = await admin.from("category_showcase_settings").select(
      "category_label, video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url, home_grid_cover_image_url, display_order"
    );

    if (!fullSel.error) {
      rows = fullSel.data ?? [];
    } else if (isMissingSchemaColumnError(fullSel.error)) {
      const legacy = await admin.from("category_showcase_settings").select(
        "category_label, video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url, display_order"
      );
      if (legacy.error) {
        return NextResponse.json({ error: legacy.error.message }, { status: 500 });
      }
      rows = legacy.data ?? [];
      schemaHasHomeGrid = false;
    } else if (
      /display_order|catalog_cover_image_url/i.test(fullSel.error.message ?? "")
    ) {
      return NextResponse.json(
        {
          error:
            "Execute o SQL em supabase/migration_category_catalog_cover.sql no Supabase.",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json({ error: fullSel.error.message }, { status: 500 });
    }

    const mapExact = new Map<string, RowLite>();
    const mapNormalized = new Map<string, RowLite>();
    for (const raw of rows ?? []) {
      const label = String(raw.category_label ?? "").trim();
      if (!label) continue;
      const row: RowLite = {
        category_label: label,
        video_url: raw.video_url?.trim() || null,
        video_poster_url: raw.video_poster_url?.trim() || null,
        wholesale_tiers: sanitizeWholesaleTiers(raw.wholesale_tiers),
        home_grid_cover_image_url: schemaHasHomeGrid
          ? (raw as { home_grid_cover_image_url?: string | null })
              .home_grid_cover_image_url?.trim() || null
          : null,
        catalog_cover_image_url:
          (raw as { catalog_cover_image_url?: string | null })
            .catalog_cover_image_url?.trim() || null,
        display_order:
          typeof (raw as { display_order?: number }).display_order === "number"
            ? (raw as { display_order: number }).display_order
            : null,
      };
      mapExact.set(label, row);
      const nk = categoryLookupKey(label);
      if (!mapNormalized.has(nk)) mapNormalized.set(nk, row);
    }

    const rowForProductLabel = (productLabel: string): RowLite | undefined =>
      mapExact.get(productLabel) ??
      mapNormalized.get(categoryLookupKey(productLabel));

    const orderVals = new Map<string, number | null | undefined>();
    for (const l of labels) {
      orderVals.set(l, rowForProductLabel(l)?.display_order ?? null);
    }

    const sorted = sortCategoryLabelsForCatalog(labels, orderVals);
    const idx = sorted.indexOf(category_label);
    if (idx < 0) {
      return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    }

    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= sorted.length) {
      return NextResponse.json({ ok: true, noop: true });
    }

    const a = sorted[idx]!;
    const b = sorted[neighborIdx]!;

    /** Ordem efectiva: ignora sentinela 100000 para poder distinguir vizinhos ao trocar. */
    const resolveDisplayOrder = (
      label: string,
      positionInSorted: number
    ): number => {
      const v = rowForProductLabel(label)?.display_order;
      if (
        v != null &&
        Number.isFinite(v) &&
        v !== DISPLAY_ORDER_DEFAULT_SENTINEL
      ) {
        return v;
      }
      return (positionInSorted + 1) * 1000;
    };

    let oa = resolveDisplayOrder(a, idx);
    let ob = resolveDisplayOrder(b, neighborIdx);

    if (oa === ob) {
      oa = (idx + 1) * 1000;
      ob = (neighborIdx + 1) * 1000;
    }

    const tmp = oa;
    oa = ob;
    ob = tmp;

    const upsertOne = async (label: string, display_order: number) => {
      const cur = rowForProductLabel(label);
      const payload: Record<string, unknown> = {
        category_label: label,
        video_url: cur?.video_url ?? null,
        video_poster_url: cur?.video_poster_url ?? null,
        wholesale_tiers: cur?.wholesale_tiers ?? DEFAULT_SHOWCASE.wholesaleTiers,
        catalog_cover_image_url: cur?.catalog_cover_image_url ?? null,
        display_order,
      };
      if (schemaHasHomeGrid) {
        payload.home_grid_cover_image_url = cur?.home_grid_cover_image_url ?? null;
      }
      const { error } = await admin
        .from("category_showcase_settings")
        .upsert(payload, { onConflict: "category_label" });
      if (error) throw new Error(error.message);
    };

    await upsertOne(a, oa);
    await upsertOne(b, ob);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
