import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import {
  confirmedAtFilterForPeriod,
  parseTzOffsetMinutes,
} from "@/lib/admin-period";
import {
  aggregateStockInventory,
  type ProductStockRow,
} from "@/lib/stock-inventory";
import { excludeCrmRemarketingFromOrdersQuery } from "@/lib/crm-legacy-import";
import { applyRealAppConfirmedOrdersFilter } from "@/lib/real-app-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;

function localDayKey(iso: string, tzOffsetMinutes: number): string {
  const d = new Date(new Date(iso).getTime() - tzOffsetMinutes * 60_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/admin/home-previews — dados leves para prévias nos cards do painel.
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

  const { searchParams } = new URL(request.url);
  const tzOffsetMinutes = parseTzOffsetMinutes(
    searchParams.get("tzOffsetMinutes")
  );

  try {
    const admin = createAdminClient();
    const principal = await resolvePrincipal(request);
    const isOwner =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");

    const { count: pendingCount, error: pendErr } = await excludeCrmRemarketingFromOrdersQuery(
      admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDENTE_PAGAMENTO")
    );

    if (pendErr) {
      return NextResponse.json({ error: pendErr.message }, { status: 500 });
    }

    const { data: lastOrder, error: lastErr } = await applyRealAppConfirmedOrdersFilter(
      admin
        .from("orders")
        .select(
          "id, display_number, sale_amount, confirmed_at, customer_name, customer_whatsapp"
        )
    )
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      return NextResponse.json({ error: lastErr.message }, { status: 500 });
    }

    const last7Filter = confirmedAtFilterForPeriod("last7", {
      tzOffsetMinutes,
    });
    let revenueSparkline: number[] = [];
    if (last7Filter.kind === "range") {
      const weekEnd =
        last7Filter.endIso ?? new Date().toISOString();

      const { data: weekOrders, error: weekErr } = await applyRealAppConfirmedOrdersFilter(
        admin.from("orders").select("confirmed_at, sale_amount")
      )
        .gte("confirmed_at", last7Filter.startIso)
        .lt("confirmed_at", weekEnd);

      if (weekErr) {
        return NextResponse.json({ error: weekErr.message }, { status: 500 });
      }

      const dayTotals = new Map<string, number>();
      for (const o of weekOrders ?? []) {
        const at = (o as { confirmed_at?: string }).confirmed_at;
        const amt = Number((o as { sale_amount?: number }).sale_amount);
        if (!at || !Number.isFinite(amt)) continue;
        const key = localDayKey(at, tzOffsetMinutes);
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + amt);
      }
      const sortedDays = Array.from(dayTotals.keys()).sort();
      revenueSparkline = sortedDays.map((d) =>
        Number((dayTotals.get(d) ?? 0).toFixed(2))
      );
    }
    let estoque: {
      totalPieces: number;
      bars: { label: string; pieces: number }[];
    } | null = null;

    if (isOwner) {
      const products: ProductStockRow[] = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await admin
          .from("products")
          .select("category, size, stock, status, updated_at")
          .range(offset, offset + PAGE - 1);
        if (error) break;
        const chunk = (data ?? []) as ProductStockRow[];
        products.push(...chunk);
        if (chunk.length < PAGE) break;
        offset += PAGE;
      }
      const snap = aggregateStockInventory(products);
      estoque = {
        totalPieces: snap.grandTotal.pieces,
        bars: snap.categories.slice(0, 5).map((c) => ({
          label: c.category,
          pieces: c.pieces,
        })),
      };
    }

    const lo = lastOrder as {
      display_number?: number;
      sale_amount?: number;
      confirmed_at?: string;
      customer_name?: string | null;
      customer_whatsapp?: string | null;
    } | null;

    return NextResponse.json(
      {
        pedidos: { pendingCount: pendingCount ?? 0 },
        historico: lo
          ? {
              displayNumber:
                typeof lo.display_number === "number" && lo.display_number > 0
                  ? lo.display_number
                  : null,
              saleAmount: Number(lo.sale_amount),
              confirmedAt: lo.confirmed_at ?? null,
              customerLabel:
                lo.customer_name?.trim() ||
                (lo.customer_whatsapp
                  ? `···${String(lo.customer_whatsapp).slice(-4)}`
                  : null),
            }
          : null,
        metricas: { revenueSparkline },
        estoque,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
