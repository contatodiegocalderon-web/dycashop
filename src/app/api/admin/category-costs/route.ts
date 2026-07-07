import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin, assertOwnerAccess } from "@/lib/admin-auth";
import { defaultWeightGramsFromEnv } from "@/lib/cart-shipping-weight";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";
export const runtime = "nodejs";

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

    const { data: products, error: pErr } = await admin
      .from("products")
      .select("category");

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const catalogLabels = new Set<string>();
    for (const row of products ?? []) {
      const raw = (row as { category: string | null }).category;
      const label =
        raw != null && String(raw).trim() !== ""
          ? String(raw).trim()
          : "Sem categoria";
      catalogLabels.add(label);
    }
    if (catalogLabels.size === 0) {
      catalogLabels.add("Sem categoria");
    }

    const sortedCatalog = Array.from(catalogLabels).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );

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
        costMapLegacy.set(row.category_label, {
          cost_per_piece: Number(row.cost_per_piece),
          updated_at: row.updated_at ?? null,
        });
      }
      const rowsLegacy = sortedCatalog.map((category_label) => {
        const d = costMapLegacy.get(category_label);
        return {
          category_label,
          cost_per_piece: d?.cost_per_piece ?? 0,
          weight_grams_per_piece: defaultWeightGramsFromEnv(),
          updated_at: d?.updated_at ?? null,
        };
      });
      return NextResponse.json({ rows: rowsLegacy, catalogCategories: sortedCatalog });
    }

    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    const costMap = new Map<
      string,
      {
        cost_per_piece: number;
        weight_grams_per_piece: number;
        updated_at: string | null;
      }
    >();
    for (const row of defaults ?? []) {
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

    const rows = sortedCatalog.map((category_label) => {
      const d = costMap.get(category_label);
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
    const rows = entries.map((e) => {
      const label = String(e.category_label ?? "").trim();
      const cost = Number(e.cost_per_piece);
      const weight = Number(e.weight_grams_per_piece);
      if (!label || Number.isNaN(cost) || cost < 0) {
        throw new Error("Categoria ou custo inválido");
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error(`Peso inválido para ${label}`);
      }
      return {
        category_label: label,
        cost_per_piece: cost,
        weight_grams_per_piece: Math.round(weight),
      };
    });

    const { error } = await admin.from("category_cost_defaults").upsert(rows, {
      onConflict: "category_label",
    });

    if (error && isMissingSchemaColumnError(error)) {
      const legacyRows = rows.map(({ category_label, cost_per_piece }) => ({
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
        warning:
          "Peso não gravado: execute a migration category_weight_grams no Supabase.",
      });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
