import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { assertAdmin } from "@/lib/admin-auth";
import type { AbandonedOrderRow } from "@/app/api/admin/abandoned-carts/route";
import type { AdminClientRow } from "@/app/api/admin/clients/route";
import type { OpenOrderRow } from "@/app/api/admin/crm/open-orders/route";
import { clientRecencyLabel } from "@/lib/client-recency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function profileLabel(p: string | null | undefined): string {
  if (p === "lojista") return "Lojista";
  if (p === "revendedor") return "Revendedor";
  if (p === "uso_proprio") return "Uso próprio";
  return "";
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR");
}

function money(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function authHeaders(request: NextRequest): HeadersInit {
  const h: Record<string, string> = {};
  const cookie = request.headers.get("cookie");
  if (cookie) h.cookie = cookie;
  const key = request.headers.get("x-admin-key");
  if (key) h["x-admin-key"] = key;
  return h;
}

async function fetchJson<T>(
  request: NextRequest,
  path: string
): Promise<T> {
  const url = new URL(path, request.nextUrl.origin);
  const res = await fetch(url, {
    headers: authHeaders(request),
    cache: "no-store",
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Falha ao carregar ${path} (${res.status})`);
  }
  return data;
}

/**
 * GET /api/admin/clients/export
 * Excel com todas as etapas do funil (clientes pagos, abandonados, em aberto).
 * Query: sellerScope (owner).
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
    const sellerScope =
      request.nextUrl.searchParams.get("sellerScope")?.trim() || "all";
    const qs = new URLSearchParams();
    if (sellerScope && sellerScope !== "all") {
      qs.set("sellerScope", sellerScope);
    }
    const q = qs.toString() ? `?${qs.toString()}` : "";

    const [clientsPayload, abandonedPayload, openPayload] = await Promise.all([
      fetchJson<{ clients: AdminClientRow[] }>(
        request,
        `/api/admin/clients${q}`
      ),
      fetchJson<{ orders: AbandonedOrderRow[] }>(
        request,
        `/api/admin/abandoned-carts${q}`
      ),
      fetchJson<{ orders: OpenOrderRow[] }>(
        request,
        `/api/admin/crm/open-orders${q}`
      ),
    ]);

    const clients = clientsPayload.clients ?? [];
    const abandoned = abandonedPayload.orders ?? [];
    const openOrders = openPayload.orders ?? [];

    const clientsSheet = clients.map((c) => ({
      WhatsApp: c.customer_whatsapp,
      Nome: c.customer_name ?? "",
      Segmento: c.customer_segment ?? "",
      Novo: c.is_new ? "Sim" : "Não",
      Pedidos: c.order_count,
      "Total gasto (R$)": money(c.total_spent),
      "Primeira compra": fmtWhen(c.first_confirmed_at),
      "Última compra": fmtWhen(c.last_confirmed_at),
      Recência: clientRecencyLabel(c.recency_status),
      Perfil: profileLabel(c.business_profile),
      Vendedores: c.sellers_label ?? "",
      Etapa:
        c.recency_status === "green"
          ? "Comprou < 30d"
          : c.recency_status === "yellow"
            ? "Comprou 30–59d"
            : c.recency_status === "red"
              ? "Comprou 60+d"
              : "Clientes",
    }));

    const abandonedSheet = abandoned.map((o) => ({
      WhatsApp: o.customer_whatsapp,
      Nome: o.customer_name ?? "",
      "Pedido ID": o.order_id,
      "Criado em": fmtWhen(o.created_at),
      Peças: o.total_pieces,
      Volume: o.volume_tier === "atacado" ? "Atacado" : "Varejo",
      "Já comprou antes": o.has_paid_before ? "Sim" : "Não",
      "Pedidos cancelados": o.cancelled_order_count,
      "Tem pedido em aberto": o.has_open_order ? "Sim" : "Não",
      "Cliques WhatsApp": o.whatsapp_click_count,
      "Follow-ups": o.follow_up_count,
      "Follow-ups restantes": o.follow_up_remaining,
      Perfil: profileLabel(o.business_profile),
      Vendedor: o.requested_seller_name ?? "",
      Etapa: "Abandonados",
    }));

    const openSheet = openOrders.map((o) => ({
      WhatsApp: o.customer_whatsapp,
      Nome: o.customer_name ?? "",
      "Pedido ID": o.order_id,
      "Criado em": fmtWhen(o.created_at),
      Peças: o.total_pieces,
      Volume: o.volume_tier === "atacado" ? "Atacado" : "Varejo",
      "Já comprou antes": o.has_paid_before ? "Sim" : "Não",
      Perfil: profileLabel(o.business_profile),
      Vendedor: o.requested_seller_name ?? "",
      Etapa: "Em aberto",
    }));

    const todosSheet = [
      ...clientsSheet.map((r) => ({
        Etapa: r.Etapa,
        WhatsApp: r.WhatsApp,
        Nome: r.Nome,
        Perfil: r.Perfil,
        Detalhe: `${r.Pedidos} pedido(s) · ${r.Recência}`,
        "Valor / peças": r["Total gasto (R$)"],
        "Data ref.": r["Última compra"],
        Extra: r.Vendedores,
      })),
      ...abandonedSheet.map((r) => ({
        Etapa: r.Etapa,
        WhatsApp: r.WhatsApp,
        Nome: r.Nome,
        Perfil: r.Perfil,
        Detalhe: `Cancelado · ${r.Volume}`,
        "Valor / peças": r.Peças,
        "Data ref.": r["Criado em"],
        Extra: r.Vendedor,
      })),
      ...openSheet.map((r) => ({
        Etapa: r.Etapa,
        WhatsApp: r.WhatsApp,
        Nome: r.Nome,
        Perfil: r.Perfil,
        Detalhe: `Pendente · ${r.Volume}`,
        "Valor / peças": r.Peças,
        "Data ref.": r["Criado em"],
        Extra: r.Vendedor,
      })),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(todosSheet),
      "Todos os leads"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(clientsSheet),
      "Clientes pagos"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(abandonedSheet),
      "Abandonados"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(openSheet),
      "Em aberto"
    );

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `crm-leads-${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
