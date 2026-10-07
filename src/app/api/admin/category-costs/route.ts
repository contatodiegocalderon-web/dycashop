import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin, assertOwnerAccess } from "@/lib/admin-auth";
import { defaultWeightGramsFromEnv } from "@/lib/cart-shipping-weight";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";
import { categoryLookupKey } from "@/lib/catalog-categories";
import { KITS_CATEGORY_LABEL, ensureKitsCategoryLabel } from "@/lib/kits-category";
export const runtime = "nodejs";

const PAGE_SIZE = 1000;

/**
 * Todas as pastas do catálogo. Um select sem paginação para em 1000 linhas
 * e some com BLUSA MOLETOM, CONJUNTO DRYFIT FRIO e outras categorias menores:
 * o formulário mostra custo 0 e o lucro deixa de descontar o valor gravado.
 */
async function loadProductCategoryLabels(
  admin: ReturnType<typeof createAdminClient>
): Promise<Set<string>> {
  const catalogLabels = new Set<string>();
  let offset = 0;
  while (true) {
    const { data: products, error: pErr } = await admin
      .from("products")
      .select("category")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (pErr) throw new Error(pErr.message);

    const chunk = (products ?? []) as { category: string | null }[];
    for (const row of chunk) {
      const raw = row.category;
      const label =
        raw != null && String(raw).trim() !== ""
          ? String(raw).trim()
          : "Sem categoria";
      catalogLabels.add(label);
    }
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  if (catalogLabels.size === 0) {
    catalogLabels.add("Sem categoria");
  }
  catalogLabels.add(KITS_CATEGORY_LABEL);
  return catalogLabels;
}

function rememberStoredCostLabel(labels: Set<string>, raw: unknown) {
  const label = String(raw ?? "").trim();
  if (!label) return;
  const key = categoryLookupKey(label);
  for (const existing of Array.from(labels)) {
    if (categoryLookupKey(existing) === key) return;
  }
  labels.add(label);
}

type StoredCost = {
  cost_per_piece: number;
  weight_grams_per_piece: number;
  updated_at: string | null;
};

function readStoredCost(
  costs: Map<string, StoredCost>,
  label: string
): StoredCost | undefined {
  const exact = costs.get(label);
  if (exact) return exact;
  const key = categoryLookupKey(label);
  for (const [storedLabel, value] of Array.from(costs)) {
    if (categoryLookupKey(storedLabel) === key) return value;
  }
  return undefined;
}

/**
 * GET /api/admin/category-costs — custo padrão por categoria (para lucro).
 */
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
    const catalogLabels = await loadProductCategoryLabels(admin);

    const { data: defaults, error: dErr } = await admin
      .from("category_cost_defaults")
      .select("category_label, cost_per_piece, weight_grams_per_piece, updated_at");

    if (dErr && isMissingSchemaColumnError(dErr)) {
      const legacy = await admin
        .from("category_cost_defaults")
        .select("category_label, cost_per_piece, updated_at");
      if (legacy.error) {
        return NextResponse.json({ error: legacy.error.message }, { status: 500 });
      }
      const costMapLegacy = new Map<
        string,
        { cost_per_piece: number; updated_at: string | null }
      >();
      for (const row of legacy.data ?? []) {
        rememberStoredCostLabel(catalogLabels, row.category_label);
        costMapLegacy.set(row.category_label, {
          cost_per_piece: Number(row.cost_per_piece),
          updated_at: row.updated_at ?? null,
        });
      }
      const sortedLegacy = Array.from(
        ensureKitsCategoryLabel(catalogLabels)
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));
      const rowsLegacy = sortedLegacy.map((category_label) => {
        const d = readStoredCost(
          new Map(
            Array.from(costMapLegacy.entries()).map(([label, value]) => [
              label,
              {
                cost_per_piece: value.cost_per_piece,
                weight_grams_per_piece: defaultWeightGramsFromEnv(),
                updated_at: value.updated_at,
              },
            ])
          ),
          category_label
        );
        return {
          category_label,
          cost_per_piece: d?.cost_per_piece ?? 0,
          weight_grams_per_piece: defaultWeightGramsFromEnv(),
          updated_at: d?.updated_at ?? null,
        };
      });
      return NextResponse.json({ rows: rowsLegacy, catalogCategories: sortedLegacy });
    }

    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    const costMap = new Map<string, StoredCost>();
    for (const row of defaults ?? []) {
      rememberStoredCostLabel(catalogLabels, row.category_label);
      const w = Number(
        (row as { weight_grams_per_piece?: number }).weight_grams_per_piece
      );
      costMap.set(row.category_label, {
        cost_per_piece: Number(row.cost_per_piece),
        weight_grams_per_piece:
          Number.isFinite(w) && w > 0 ? w : defaultWeightGramsFromEnv(),
        updated_at: row.updated_at ?? null,
      });
    }

    const sortedCatalog = Array.from(
      ensureKitsCategoryLabel(catalogLabels)
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    const rows = sortedCatalog.map((category_label) => {
      const d = readStoredCost(costMap, category_label);
      return {
        category_label,
        cost_per_piece: d?.cost_per_piece ?? 0,
        weight_grams_per_piece:
          d?.weight_grams_per_piece ?? defaultWeightGramsFromEnv(),
        updated_at: d?.updated_at ?? null,
      };
    });

    return NextResponse.json({ rows, catalogCategories: sortedCatalog });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/admin/category-costs — upsert custos e peso (frete).
 */
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
        cost_per_piece: number;
        weight_grams_per_piece?: number;
      }[];
    };
    const entries = body.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        {
          error:
            "Informe entries: [{ category_label, cost_per_piece, weight_grams_per_piece }]",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: existingRows, error: existingErr } = await admin
      .from("category_cost_defaults")
      .select("category_label, cost_per_piece");
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    const existingByKey = new Map<string, { label: string; cost: number }>();
    for (const row of existingRows ?? []) {
      const label = String(row.category_label ?? "").trim();
      if (!label) continue;
      const cost = Number(row.cost_per_piece);
      existingByKey.set(categoryLookupKey(label), {
        label,
        cost: Number.isFinite(cost) ? cost : 0,
      });
    }

    const rows = entries.map((e) => {
      const label = String(e.category_label ?? "").trim();
      let cost = Number(e.cost_per_piece);
      const weight = Number(e.weight_grams_per_piece);
      if (!label || Number.isNaN(cost) || cost < 0) {
        throw new Error("Categoria ou custo inválido");
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error(`Peso inválido para ${label}`);
      }
      const prev = existingByKey.get(categoryLookupKey(label));
      // O formulário às vezes reenvia 0 para moletom/conjunto porque o campo
      // não tinha carregado o custo. Não apaga um custo já gravado.
      if (cost === 0 && prev && prev.cost > 0) {
        cost = prev.cost;
      }
      return {
        category_label: prev?.label ?? label,
        cost_per_piece: cost,
        weight_grams_per_piece: Math.round(weight),
      };
    });

    const deduped = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const prev = deduped.get(row.category_label);
      if (!prev || row.cost_per_piece > 0 || prev.cost_per_piece === 0) {
        deduped.set(row.category_label, row);
      }
    }
    const payload = Array.from(deduped.values());

    const { error } = await admin.from("category_cost_defaults").upsert(payload, {
      onConflict: "category_label",
    });

    if (error && isMissingSchemaColumnError(error)) {
      const legacyRows = payload.map(({ category_label, cost_per_piece }) => ({
        category_label,
        cost_per_piece,
      }));
      const legacy = await admin.from("category_cost_defaults").upsert(legacyRows, {
        onConflict: "category_label",
      });
      if (legacy.error) {
        return NextResponse.json({ error: legacy.error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        rows: legacyRows,
        warning:
          "Peso não gravado: execute a migration category_weight_grams no Supabase.",
      });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
