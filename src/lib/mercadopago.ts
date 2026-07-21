import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

export function getMercadoPagoAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
  if (!token) {
    throw new Error(
      "MERCADOPAGO_ACCESS_TOKEN ausente. Configure no .env.local / Vercel."
    );
  }
  return token;
}

export function createMercadoPagoClient() {
  return new MercadoPagoConfig({
    accessToken: getMercadoPagoAccessToken(),
  });
}

export function createPreferenceClient() {
  return new Preference(createMercadoPagoClient());
}

export function createPaymentClient() {
  return new Payment(createMercadoPagoClient());
}

export function appPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

/** auto_return / notification_url do MP exigem HTTPS público (não localhost). */
export function isMercadoPagoPublicHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** O SDK do MP muitas vezes lança um objeto plain, não Error. */
export function formatMercadoPagoError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg =
      (typeof o.message === "string" && o.message) ||
      (typeof o.error === "string" && o.error) ||
      (typeof o.cause === "string" && o.cause);
    if (msg) return msg;
    const nested = o.cause;
    if (nested && typeof nested === "object") {
      const c = nested as Record<string, unknown>;
      if (typeof c.message === "string" && c.message) return c.message;
      if (typeof c.description === "string" && c.description) return c.description;
    }
    try {
      return JSON.stringify(err);
    } catch {
      /* ignore */
    }
  }
  return "Falha ao criar preferência no Mercado Pago";
}
