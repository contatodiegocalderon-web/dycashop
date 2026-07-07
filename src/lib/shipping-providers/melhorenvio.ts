import {
  DEFAULT_PACKAGE_CM,
  packageWeightKg,
} from "./package-defaults";
import { melhorEnvioConfig, shippingUserAgent } from "./config";
import type { PacSedexQuoteInput, PacSedexQuoteResult, PacSedexServiceQuote } from "./types";

const FETCH_TIMEOUT_MS = 15_000;

type MelhorEnvioQuoteRow = {
  id?: number;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  discount?: string | number;
  delivery_time?: number;
  custom_delivery_time?: number;
  delivery_range?: { min?: number; max?: number };
  custom_delivery_range?: { min?: number; max?: number };
  error?: string;
};

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function rowToQuote(row: MelhorEnvioQuoteRow): PacSedexServiceQuote | null {
  const name = (row.name ?? "").toUpperCase();
  const label: "PAC" | "SEDEX" | null = name.includes("SEDEX")
    ? "SEDEX"
    : name === "PAC" || name.includes("PAC")
      ? "PAC"
      : null;
  if (!label) return null;
  if (row.error) {
    return {
      code: String(row.id ?? label),
      label,
      price: 0,
      deliveryDays: 0,
      error: row.error,
    };
  }

  const price = parseMoney(row.custom_price ?? row.price);
  const discount = parseMoney(row.discount);
  const days =
    row.custom_delivery_time ??
    row.delivery_time ??
    row.custom_delivery_range?.max ??
    row.delivery_range?.max ??
    0;

  if (!Number.isFinite(price) || price <= 0) {
    return {
      code: String(row.id ?? label),
      label,
      price: 0,
      deliveryDays: 0,
      error: "Valor indisponível",
    };
  }

  return {
    code: String(row.id ?? label),
    label,
    price,
    originalPrice:
      discount > 0 ? Math.round((price + discount) * 100) / 100 : undefined,
    deliveryDays: Math.max(1, Math.round(days)),
  };
}

export async function fetchMelhorEnvioPacSedexQuote(
  opts: PacSedexQuoteInput
): Promise<PacSedexQuoteResult> {
  const { token, baseUrl } = melhorEnvioConfig();
  const origin = opts.originCep.replace(/\D/g, "");
  const dest = opts.destinationCep.replace(/\D/g, "");
  if (origin.length !== 8 || dest.length !== 8) {
    throw new Error("CEP de origem ou destino inválido.");
  }

  const weight = packageWeightKg(opts.weightKg);
  const body = {
    from: { postal_code: origin },
    to: { postal_code: dest },
    volumes: [
      {
        width: DEFAULT_PACKAGE_CM.width,
        height: DEFAULT_PACKAGE_CM.height,
        length: DEFAULT_PACKAGE_CM.length,
        weight,
        insurance: 0,
      },
    ],
    options: {
      receipt: false,
      own_hand: false,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": shippingUserAgent(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    const data = (await res.json()) as unknown;
    if (!res.ok) {
      const msg =
        typeof data === "object" &&
        data &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Melhor Envio indisponível (${res.status}).`;
      throw new Error(msg);
    }

    const rows = Array.isArray(data) ? (data as MelhorEnvioQuoteRow[]) : [];
    let pac: PacSedexServiceQuote | null = null;
    let sedex: PacSedexServiceQuote | null = null;

    for (const row of rows) {
      const q = rowToQuote(row);
      if (!q || q.error || q.price <= 0) continue;
      if (q.label === "PAC") pac = q;
      if (q.label === "SEDEX") sedex = q;
    }

    if (!pac && !sedex) {
      throw new Error("Melhor Envio não retornou PAC/SEDEX para este CEP.");
    }

    return { pac, sedex, provider: "melhorenvio" };
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error("Melhor Envio demorou para responder. Tente novamente.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
