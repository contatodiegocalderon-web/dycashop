import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  defaultWeightGramsFromEnv,
  gramsToCorreiosKg,
  normalizeCategoryLabel,
  normalizeCepDigits,
  totalCartWeightGrams,
  type CategoryWeightMap,
} from "@/lib/cart-shipping-weight";
import {
  fetchCorreiosPacSedexQuote,
  formatDeliveryDaysRange,
  formatFreightMoneyBrl,
  type CorreiosServiceQuote,
} from "@/lib/correios-quote";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuoteItem = { category: string; quantity: number };

function shippingOriginCep(): string | null {
  const raw =
    process.env.SHIPPING_ORIGIN_CEP?.trim() ||
    process.env.NEXT_PUBLIC_SHIPPING_ORIGIN_CEP?.trim();
  if (!raw) return null;
  return normalizeCepDigits(raw);
}

async function loadCategoryWeights(
  admin: ReturnType<typeof createAdminClient>
): Promise<CategoryWeightMap> {
  const full = await admin
    .from("category_cost_defaults")
    .select("category_label, weight_grams_per_piece");
  if (!full.error) {
    const map: CategoryWeightMap = {};
    for (const row of full.data ?? []) {
      const label = normalizeCategoryLabel(
        (row as { category_label?: string }).category_label
      );
      const g = Number(
        (row as { weight_grams_per_piece?: number }).weight_grams_per_piece
      );
      if (label && Number.isFinite(g) && g > 0) map[label] = g;
    }
    return map;
  }
  if (!isMissingSchemaColumnError(full.error)) {
    throw new Error(full.error.message);
  }
  const base = await admin
    .from("category_cost_defaults")
    .select("category_label");
  if (base.error) throw new Error(base.error.message);
  const map: CategoryWeightMap = {};
  const fallback = defaultWeightGramsFromEnv();
  for (const row of base.data ?? []) {
    const label = normalizeCategoryLabel(
      (row as { category_label?: string }).category_label
    );
    if (label) map[label] = fallback;
  }
  return map;
}

function serializeService(q: CorreiosServiceQuote | null) {
  if (!q || q.error || q.price <= 0) {
    return q?.error ? { error: q.error } : null;
  }
  return {
    label: q.label,
    code: q.code,
    price: q.price,
    priceFormatted: formatFreightMoneyBrl(q.price),
    deliveryDays: q.deliveryDays,
    deliveryLabel: formatDeliveryDaysRange(q.deliveryDays),
  };
}

/**
 * POST /api/shipping/quote
 * Body: { cep: string, items: { category: string, quantity: number }[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      cep?: string;
      items?: QuoteItem[];
    };
    const destCep = normalizeCepDigits(String(body.cep ?? ""));
    if (!destCep) {
      return NextResponse.json(
        { error: "Informe um CEP válido (8 dígitos)." },
        { status: 400 }
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Carrinho vazio." }, { status: 400 });
    }

    const normalizedItems = items
      .map((it) => ({
        category: normalizeCategoryLabel(it.category),
        quantity: Math.max(0, Number(it.quantity) || 0),
      }))
      .filter((it) => it.quantity > 0);

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma peça no pedido." },
        { status: 400 }
      );
    }

    const originCep = shippingOriginCep();
    if (!originCep) {
      return NextResponse.json(
        {
          error:
            "CEP de origem não configurado (SHIPPING_ORIGIN_CEP). Contacte a loja.",
        },
        { status: 503 }
      );
    }

    const admin = createAdminClient();
    const weights = await loadCategoryWeights(admin);
    const fallback = defaultWeightGramsFromEnv();
    const totalGrams = totalCartWeightGrams(
      normalizedItems,
      weights,
      fallback
    );
    const totalPieces = normalizedItems.reduce((s, it) => s + it.quantity, 0);
    const weightKg = gramsToCorreiosKg(totalGrams);

    const correios = await fetchCorreiosPacSedexQuote({
      originCep,
      destinationCep: destCep,
      weightKg,
    });

    return NextResponse.json(
      {
        destinationCep: destCep,
        totalPieces,
        totalWeightGrams: totalGrams,
        totalWeightKg: weightKg,
        pac: serializeService(correios.pac),
        sedex: serializeService(correios.sedex),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao calcular frete";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
