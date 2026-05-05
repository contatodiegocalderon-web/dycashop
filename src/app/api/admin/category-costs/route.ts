import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin, assertOwnerAccess } from "@/lib/admin-auth";

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
      .select("category_label, cost_per_piece, updated_at");

    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    const costMap = new Map<
      string,
      { cost_per_piece: number; updated_at: string | null }
    >();
    for (const row of defaults ?? []) {
      costMap.set(row.category_label, {
        cost_per_piece: Number(row.cost_per_piece),
        updated_at: row.updated_at ?? null,
      });
    }

    const rows = sortedCatalog.map((category_label) => {
      const d = costMap.get(category_label);
      return {
        category_label,
        cost_per_piece: d?.cost_per_piece ?? 0,
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
 * PUT /api/admin/category-costs — upsert custos (body: { entries: { category_label, cost_per_piece }[] }).
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
      entries?: { category_label: string; cost_per_piece: number }[];
    };
    const entries = body.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "Informe entries: [{ category_label, cost_per_piece }]" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const rows = entries.map((e) => {
      const label = String(e.category_label ?? "").trim();
      const cost = Number(e.cost_per_piece);
      if (!label || Number.isNaN(cost) || cost < 0) {
        throw new Error("Categoria ou custo inválido");
      }
      return { category_label: label, cost_per_piece: cost };
    });

    const { error } = await admin.from("category_cost_defaults").upsert(rows, {
      onConflict: "category_label",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
