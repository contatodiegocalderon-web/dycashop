import type { ShippingProviderId } from "./types";

export function shippingUserAgent(): string {
  const raw = process.env.SHIPPING_API_USER_AGENT?.trim();
  if (raw) return raw;
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim() || "dycashop.vercel.app";
  const host = app.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `DYCASHOP (${host})`;
}

export function resolveShippingProvider(): ShippingProviderId {
  const explicit = process.env.SHIPPING_PROVIDER?.trim().toLowerCase();
  if (explicit === "superfrete") return "superfrete";
  if (
    explicit === "melhorenvio" ||
    explicit === "melhor_envio" ||
    explicit === "melhor-envio"
  ) {
    return "melhorenvio";
  }
  if (process.env.SUPERFRETE_TOKEN?.trim()) return "superfrete";
  if (process.env.MELHOR_ENVIO_TOKEN?.trim()) return "melhorenvio";
  throw new Error(
    "Frete não configurado: defina SUPERFRETE_TOKEN ou MELHOR_ENVIO_TOKEN (e opcionalmente SHIPPING_PROVIDER)."
  );
}

export function superfreteConfig() {
  const token = process.env.SUPERFRETE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "SUPERFRETE_TOKEN não configurado. Gere em https://web.superfrete.com/#/integrations"
    );
  }
  const base =
    process.env.SUPERFRETE_API_URL?.trim() || "https://api.superfrete.com";
  return { token, baseUrl: base.replace(/\/$/, "") };
}

export function melhorEnvioConfig() {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "MELHOR_ENVIO_TOKEN não configurado. Obtenha em Melhor Envio → Integrações → Área Dev."
    );
  }
  const base =
    process.env.MELHOR_ENVIO_API_URL?.trim() || "https://melhorenvio.com.br";
  return { token, baseUrl: base.replace(/\/$/, "") };
}
