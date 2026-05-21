import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { isBusinessProfile } from "@/lib/client-follow-up";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/clients/profile
 * Classifica cliente como lojista ou revendedor.
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
    const body = (await request.json()) as Record<string, unknown>;
    const wa = String(body.customer_whatsapp ?? "")
      .replace(/\D/g, "")
      .trim();
    const profileRaw = String(body.business_profile ?? "").trim().toLowerCase();

    if (wa.length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido" },
        { status: 400 }
      );
    }
    if (!isBusinessProfile(profileRaw)) {
      return NextResponse.json(
        { error: 'business_profile deve ser "lojista" ou "revendedor"' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("crm_client_profiles").upsert(
      {
        whatsapp_digits: wa,
        business_profile: profileRaw,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "whatsapp_digits" }
    );

    if (error) {
      const missing = /does not exist|schema cache|relation/i.test(error.message);
      return NextResponse.json(
        {
          error: error.message,
          ...(missing
            ? { hint: "Execute supabase/migration_crm_client_follow_up.sql" }
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
