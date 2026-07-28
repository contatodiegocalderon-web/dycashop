/** Helpers para Web Push no admin (funciona com app fechado / tela bloqueada). */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureAdminPushSubscription(
  adminFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "ssr" };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: "insecure" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!("Notification" in window)) {
    return { ok: false, reason: "no_notification" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  const keyRes = await adminFetch("/api/admin/push-subscribe");
  if (!keyRes.ok) {
    const j = (await keyRes.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: j.error ?? "vapid" };
  }
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) return { ok: false, reason: "vapid" };

  const reg = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;
  void reg.update();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const saveRes = await adminFetch("/api/admin/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });

  if (!saveRes.ok) {
    const j = (await saveRes.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: j.error ?? "save" };
  }

  return { ok: true };
}
