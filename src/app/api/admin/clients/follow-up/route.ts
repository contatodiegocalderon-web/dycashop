import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { isBusinessProfile } from "@/lib/client-follow-up";

export const runtime = "nodejs";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveOwnerStaffId(
  admin: ReturnType<typeof createAdminClient>,
  principal: Awaited<ReturnType<typeof resolvePrincipal>>
): Promise<string | null> {
  if (principal?.kind === "staff" && principal.staff.role === "owner") {
    return principal.staff.staffId;
  }
  if (principal?.kind === "api_key") {
    const { data: ownerRow } = await admin
      .from("staff_users")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    return (ownerRow?.id as string | undefined) ?? null;
  }
  return null;
}

/** Última compra confirmada deste vendedor com o cliente. */
async function lastConfirmedAtForSeller(
  admin: ReturnType<typeof createAdminClient>,
  wa: string,
  staffId: string,
  ownerStaffId: string | null
): Promise<string | null> {
  const { data, error } = await admin
    .from("orders")
    .select("confirmed_at, confirmed_by_staff_id")
    .eq("status", "PAGO")
    .eq("customer_whatsapp", wa);

  if (error) throw new Error(error.message);

  let max: string | null = null;
  for (const raw of data ?? []) {
    const row = raw as {
      confirmed_at: string | null;
      confirmed_by_staff_id: string | null;
    };
    const sid = row.confirmed_by_staff_id ?? ownerStaffId;
    if (sid !== staffId || !row.confirmed_at) continue;
    if (!max || row.confirmed_at > max) max = row.confirmed_at;
  }
  return max;
}

/**
 * PATCH /api/admin/clients/follow-up
 * Regista follow-up de recompra e classifica o cliente (por vendedor).
 * Body: {
 *   customer_whatsapp: string,
 *   business_profile: "lojista" | "revendedor",
 *   follow_up_staff_id?: string  // obrigatório quando o dono classifica na fila global
 * }
 */
export async function PATCH(request: NextRequest) {
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
    const profileRaw = (body as Record<string, unknown>)?.business_profile;
    const staffRaw = (body as Record<string, unknown>)?.follow_up_staff_id;
    const wa = String(raw ?? "")
      .replace(/\D/g, "")
      .trim();
    if (wa.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido (mínimo 10 dígitos)" },
        { status: 400 }
      );
    }
    if (!isBusinessProfile(String(profileRaw ?? ""))) {
      return NextResponse.json(
        { error: 'Perfil inválido. Use "lojista" ou "revendedor".' },
        { status: 400 }
      );
    }

    const principal = await resolvePrincipal(request);
    const sellerId =
      principal?.kind === "staff" && principal.staff.role === "seller"
        ? principal.staff.staffId
        : null;
    const isOwner =
      principal?.kind === "api_key" ||
      (principal?.kind === "staff" && principal.staff.role === "owner");

    const admin = createAdminClient();
    const ownerStaffId = await resolveOwnerStaffId(admin, principal);
    const now = new Date().toISOString();

    let responsibleStaffId: string | null = sellerId;
    if (!responsibleStaffId) {
      const fromBody = String(staffRaw ?? "").trim();
      if (STAFF_UUID_RE.test(fromBody)) {
        responsibleStaffId = fromBody;
      } else if (isOwner) {
        const { data: lastOrder } = await admin
          .from("orders")
          .select("confirmed_at, confirmed_by_staff_id")
          .eq("status", "PAGO")
          .eq("customer_whatsapp", wa)
          .order("confirmed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastOrder) {
          const row = lastOrder as {
            confirmed_by_staff_id: string | null;
          };
          responsibleStaffId = row.confirmed_by_staff_id ?? ownerStaffId;
        }
      }
    }

    if (!responsibleStaffId) {
      return NextResponse.json(
        { error: "Não foi possível identificar o vendedor responsável." },
        { status: 400 }
      );
    }

    if (sellerId && sellerId !== responsibleStaffId) {
      return NextResponse.json(
        { error: "Só pode classificar follow-up dos seus próprios clientes." },
        { status: 403 }
      );
    }

    const lastAt = await lastConfirmedAtForSeller(
      admin,
      wa,
      responsibleStaffId,
      ownerStaffId
    );
    if (!lastAt) {
      return NextResponse.json(
        { error: "Nenhuma venda confirmada deste vendedor para este contacto." },
        { status: 400 }
      );
    }

    const { error: followErr } = await admin.from("crm_seller_follow_ups").upsert(
      {
        whatsapp_digits: wa,
        staff_id: responsibleStaffId,
        follow_up_completed_at: now,
      },
      { onConflict: "whatsapp_digits,staff_id" }
    );

    if (followErr) {
      const missing = /does not exist|schema cache|relation/i.test(
        followErr.message
      );
      return NextResponse.json(
        {
          error: followErr.message,
          ...(missing
            ? {
                hint: "Execute supabase/migration_crm_seller_follow_ups.sql no Supabase.",
              }
            : {}),
        },
        { status: 500 }
      );
    }

    const { error: profileErr } = await admin.from("crm_client_profiles").upsert(
      {
        whatsapp_digits: wa,
        business_profile: profileRaw,
        updated_at: now,
      },
      { onConflict: "whatsapp_digits" }
    );

    if (profileErr) {
      const missing = /does not exist|schema cache|relation/i.test(
        profileErr.message
      );
      return NextResponse.json(
        {
          error: profileErr.message,
          ...(missing
            ? {
                hint: "Execute supabase/migration_crm_client_follow_up.sql no Supabase.",
              }
            : {}),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
