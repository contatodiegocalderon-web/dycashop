import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export type CampaignRecipientRow = {
  id: string;
  customer_whatsapp: string;
  customer_name: string | null;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  error_message: string | null;
  sent_at: string | null;
  scheduled_at: string;
};

export async function GET(request: NextRequest, ctx: Ctx) {
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

    const { data: rawRecipients, error: rErr } = await admin
      .from("crm_bot_recipients")
      .select(
        "id, customer_whatsapp, customer_name, status, error_message, sent_at, scheduled_at"
      )
      .eq("campaign_id", id)
      .order("scheduled_at", { ascending: true });

    if (rErr) throw new Error(rErr.message);

    const recipients: CampaignRecipientRow[] = (
      (rawRecipients ?? []) as Array<{
        id: string;
        customer_whatsapp: string;
        customer_name: string | null;
        status: string;
        error_message: string | null;
        sent_at: string | null;
        scheduled_at: string;
      }>
    ).map((row) => {
      const claiming =
        row.status === "pending" &&
        typeof row.error_message === "string" &&
        row.error_message.startsWith("claim:");
      const status: CampaignRecipientRow["status"] = claiming
        ? "sending"
        : row.status === "sent" ||
            row.status === "failed" ||
            row.status === "skipped" ||
            row.status === "pending"
          ? row.status
          : "pending";
      return {
        id: row.id,
        customer_whatsapp: row.customer_whatsapp,
        customer_name: row.customer_name,
        status,
        error_message: claiming ? null : row.error_message,
        sent_at: row.sent_at,
        scheduled_at: row.scheduled_at,
      };
    });

    let pending = 0;
    let sending = 0;
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      if (r.status === "pending") pending += 1;
      else if (r.status === "sending") sending += 1;
      else if (r.status === "sent") sent += 1;
      else if (r.status === "failed") failed += 1;
    }

    return NextResponse.json({
      campaign,
      recipients,
      stats: {
        pending,
        sending,
        sent,
        failed,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
