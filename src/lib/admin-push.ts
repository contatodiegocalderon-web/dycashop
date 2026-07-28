import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

function configureWebPush(): boolean {
  if (!vapidConfigured()) return false;
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    "mailto:contato@dycashop.com.br";
  webpush.setVapidDetails(
    subject,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

/**
 * Envia push para todos os admins inscritos.
 * Falhas individuais (subscription expirada) removem o registo.
 */
export async function sendAdminPush(
  payload: AdminPushPayload
): Promise<{ sent: number; removed: number }> {
  if (!configureWebPush()) {
    console.warn("[admin-push] VAPID não configurado — skip");
    return { sent: 0, removed: 0 };
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("[admin-push] list:", error.message);
    return { sent: 0, removed: 0 };
  }
  if (!rows?.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/admin/pedidos",
    tag: payload.tag ?? "dycashop-admin",
    playSound: true,
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    rows.map(async (row) => {
      const sub = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };
      try {
        await webpush.sendNotification(sub, body, {
          TTL: 60 * 60,
          urgency: "high",
        });
        sent += 1;
      } catch (e) {
        const statusCode =
          e && typeof e === "object" && "statusCode" in e
            ? Number((e as { statusCode?: number }).statusCode)
            : 0;
        // 404/410 = subscription morta
        if (statusCode === 404 || statusCode === 410) {
          await admin
            .from("admin_push_subscriptions")
            .delete()
            .eq("id", row.id);
          removed += 1;
        } else {
          console.error(
            "[admin-push] send:",
            e instanceof Error ? e.message : e
          );
        }
      }
    })
  );

  return { sent, removed };
}

export async function notifyAdminsNewPendingOrder(opts: {
  displayNumber?: number | null;
  channel?: "ATACADO" | "VAREJO";
}): Promise<void> {
  const n =
    opts.displayNumber != null && Number.isFinite(opts.displayNumber)
      ? `#${opts.displayNumber}`
      : "";
  const channel =
    opts.channel === "VAREJO"
      ? "varejo"
      : opts.channel === "ATACADO"
        ? "atacado"
        : "pedido";
  try {
    await sendAdminPush({
      title: "Novo pedido! 💰",
      body: n
        ? `Pedido ${n} (${channel}).`
        : `Novo pedido ${channel}.`,
      url:
        opts.channel === "VAREJO" ? "/admin/varejo" : "/admin/pedidos",
      tag: `order-pending-${opts.displayNumber ?? Date.now()}`,
    });
  } catch (e) {
    console.error("[admin-push] pending order:", e);
  }
}

export async function notifyAdminsVarejoPaid(opts: {
  displayNumber?: number | null;
}): Promise<void> {
  const n =
    opts.displayNumber != null && Number.isFinite(opts.displayNumber)
      ? `#${opts.displayNumber}`
      : "";
  try {
    await sendAdminPush({
      title: "Venda varejo paga! ✅",
      body: n ? `Pedido ${n} pago.` : "Pedido varejo pago.",
      url: "/admin/varejo",
      tag: `order-paid-${opts.displayNumber ?? Date.now()}`,
    });
  } catch (e) {
    console.error("[admin-push] varejo paid:", e);
  }
}
