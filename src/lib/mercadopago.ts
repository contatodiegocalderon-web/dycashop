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
