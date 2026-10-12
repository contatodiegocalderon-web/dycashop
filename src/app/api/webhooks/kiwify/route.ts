import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const runtime = "nodejs";

type KiwifyPayload = {
  order_id?: string;
  order_status?: string;
  webhook_event_type?: string;
  subscription_id?: string;
  Customer?: { email?: string; full_name?: string; mobile?: string };
  Subscription?: { status?: string };
  Product?: { product_id?: string; product_name?: string };
};

/** O webhook da Kiwify vale para todos os produtos da conta; só o plano de dropshipping dá acesso à comunidade. */
function isCommunityProduct(payload: KiwifyPayload): boolean {
  const name = payload.Product?.product_name?.trim();
  return !name || /dropshipping/i.test(name);
}

const REVOKE_EVENTS = new Set([
  "order_refunded",
  "chargeback",
  "subscription_canceled",
]);
const REVOKE_STATUSES = new Set(["refunded", "chargedback"]);

function validSignature(rawBody: string, signature: string, token: string): boolean {
  const expected = createHmac("sha1", token).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const token = process.env.KIWIFY_WEBHOOK_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "KIWIFY_WEBHOOK_TOKEN não configurado" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signature = request.nextUrl.searchParams.get("signature") ?? "";
  if (!signature || !validSignature(rawBody, signature, token)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let payload: KiwifyPayload;
  try {
    payload = JSON.parse(rawBody) as KiwifyPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const orderId = String(payload.order_id ?? "").trim();
  const email = String(payload.Customer?.email ?? "")
    .trim()
    .toLowerCase();
  if (!orderId || !email) {
    return NextResponse.json({ ok: true, ignored: "sem pedido ou email" });
  }
  if (!isCommunityProduct(payload)) {
    return NextResponse.json({ ok: true, ignored: "outro produto" });
  }

  const event = String(payload.webhook_event_type ?? "").trim();
  const orderStatus = String(payload.order_status ?? "").trim();
  const subscriptionId = String(payload.subscription_id ?? "").trim() || null;
  const revoke = REVOKE_EVENTS.has(event) || REVOKE_STATUSES.has(orderStatus);
  const paid = !revoke && orderStatus === "paid";
  const status = revoke
    ? event === "subscription_canceled"
      ? "canceled"
      : orderStatus || "refunded"
    : orderStatus || "unknown";

  const admin = createAdminClient();
  const { error: upErr } = await admin.from("drop_purchases").upsert(
    {
      kiwify_order_id: orderId,
      subscription_id: subscriptionId,
      email,
      full_name: payload.Customer?.full_name?.trim() || null,
      phone_digits: normalizeWhatsappDigits(payload.Customer?.mobile ?? "") || null,
      status,
      last_event: event || null,
      raw: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kiwify_order_id" }
  );
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (revoke || paid) {
    const updates = [
      admin.from("drop_members").update({ active: paid }).eq("email", email),
    ];
    if (subscriptionId) {
      updates.push(
        admin
          .from("drop_members")
          .update({ active: paid })
          .eq("kiwify_subscription_id", subscriptionId)
      );
    }
    for (const { error: mErr } of await Promise.all(updates)) {
      if (mErr) {
        return NextResponse.json({ error: mErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
