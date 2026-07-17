import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import {
  buildInstanceName,
  ensureEvolutionInstance,
  evolutionConnectPageUrl,
  fetchEvolutionConnect,
  isEvolutionConfigured,
} from "@/lib/crm-bot/evolution";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST — inicia campanha e prepara conexão WhatsApp. */
export async function POST(request: NextRequest, ctx: Ctx) {
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
    const { id } = await ctx.params;
    const admin = createAdminClient();
    const { data: campaign, error } = await admin
      .from("crm_bot_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
    }

    if (!isEvolutionConfigured()) {
      return NextResponse.json(
        {
          error:
            "Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no servidor para o bot enviar mensagens.",
          hint: "Sem Evolution API, o bot não consegue conectar ao WhatsApp automaticamente.",
        },
        { status: 503 }
      );
    }

    const instanceName = buildInstanceName(id);
    await ensureEvolutionInstance(instanceName);

    const connect = await fetchEvolutionConnect(instanceName);
    const managerUrl = evolutionConnectPageUrl(instanceName);

    await admin
      .from("crm_bot_campaigns")
      .update({
        status: "connecting",
        evolution_instance: instanceName,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      instanceName,
      connect,
      managerUrl,
      qrBase64: connect.base64 ?? null,
      pairingCode: connect.pairingCode ?? connect.code ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
