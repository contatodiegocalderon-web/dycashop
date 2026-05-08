import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";

export const runtime = "nodejs";

export type AdminClientRow = {
  customer_whatsapp: string;
  customer_name: string | null;
  customer_segment: string | null;
  is_new: boolean;
  order_count: number;
  total_spent: number;
  last_confirmed_at: string | null;
};

/**
 * GET /api/admin/clients — clientes com pedido pago e dados de venda registados.
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
    const principal = await resolvePrincipal(request);
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;

    const admin = createAdminClient();
    let orderQuery = admin
      .from("orders")
      .select(
        "customer_whatsapp, customer_name, customer_segment, sale_amount, confirmed_at"
      )
      .eq("status", "PAGO")
      .not("customer_whatsapp", "is", null);

    if (sellerId) {
      orderQuery = orderQuery.eq("confirmed_by_staff_id", sellerId);
    }

    const { data: orders, error } = await orderQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: hiddenRows, error: hErr } = await admin
      .from("crm_hidden_contacts")
      .select("whatsapp_digits");

    let hiddenSet = new Set<string>();
    if (hErr) {
      const msg = String(hErr.message ?? "");
      const missingTable =
        /does not exist|schema cache|relation/i.test(msg) ||
        (hErr as { code?: string }).code === "PGRST205";
      if (!missingTable) {
        return NextResponse.json({ error: hErr.message }, { status: 500 });
      }
    } else {
      hiddenSet = new Set(
        (hiddenRows ?? []).map((r: { whatsapp_digits: string }) =>
          String(r.whatsapp_digits ?? "").replace(/\D/g, "")
        )
      );
    }

    type Row = {
      customer_whatsapp: string;
      customer_name: string | null;
      customer_segment: string | null;
      sale_amount: number | null;
      confirmed_at: string | null;
    };

    const byWa = new Map<
      string,
      {
        names: string[];
        segments: string[];
        order_count: number;
        total_spent: number;
        last_at: string | null;
      }
    >();

    for (const o of (orders ?? []) as Row[]) {
      const wa = String(o.customer_whatsapp ?? "").replace(/\D/g, "");
      if (wa.length < 10) continue;

      const spent = Number(o.sale_amount ?? 0);
      const t = o.confirmed_at;

      const cur = byWa.get(wa) ?? {
        names: [],
        segments: [],
        order_count: 0,
        total_spent: 0,
        last_at: null as string | null,
      };

      cur.order_count += 1;
      if (!Number.isNaN(spent)) cur.total_spent += spent;
      if (o.customer_name?.trim()) cur.names.push(o.customer_name.trim());
      if (o.customer_segment) cur.segments.push(o.customer_segment);
      if (t) {
        if (!cur.last_at || t > cur.last_at) cur.last_at = t;
      }

      byWa.set(wa, cur);
    }

    const clients: AdminClientRow[] = Array.from(byWa.entries())
      .filter(([wa]) => !hiddenSet.has(wa))
      .map(([wa, agg]) => {
        const name =
          agg.names.length > 0 ? agg.names[agg.names.length - 1] : null;
        const isNew = agg.order_count <= 1;
        const segment = isNew ? "NOVO" : "ANTIGO";
        return {
          customer_whatsapp: wa,
          customer_name: name,
          customer_segment: segment,
          is_new: isNew,
          order_count: agg.order_count,
          total_spent: agg.total_spent,
          last_confirmed_at: agg.last_at,
        };
      });

    clients.sort((a, b) => {
      const ta = a.last_confirmed_at ?? "";
      const tb = b.last_confirmed_at ?? "";
      return tb.localeCompare(ta);
    });

    return NextResponse.json({ clients });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/clients — oculta o contacto na lista de Clientes (não apaga pedidos nem métricas).
 * Corpo JSON: { customer_whatsapp: string }
 */
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }
    const raw = (body as Record<string, unknown>)?.customer_whatsapp;
    const wa = String(raw ?? "")
      .replace(/\D/g, "")
      .trim();
    if (wa.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido (mínimo 10 dígitos)" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("crm_hidden_contacts").upsert(
      { whatsapp_digits: wa },
      { onConflict: "whatsapp_digits" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
