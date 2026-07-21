import {
  DEFAULT_PACKAGE_CM,
  packageWeightKg,
} from "./package-defaults";
import { shippingUserAgent, superfreteConfig } from "./config";
import type { PacSedexQuoteInput, PacSedexQuoteResult, PacSedexServiceQuote } from "./types";

const SUPERFRETE_PAC_ID = 1;
const SUPERFRETE_SEDEX_ID = 2;
const FETCH_TIMEOUT_MS = 15_000;

type SuperfreteQuoteRow = {
  id?: number;
  service_id?: number;
  name?: string;
  price?: number | string;
  discount?: number | string;
  delivery_time?: number;
  delivery?: number;
  delivery_min?: number;
  delivery_max?: number;
  delivery_range?: { min?: number; max?: number };
  error?: string;
  has_error?: boolean;
  message?: string;
};

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return 0;
    // Formato BR: 1.234,56
    if (s.includes(",")) {
      const n = Number(s.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function rowToQuote(
  row: SuperfreteQuoteRow,
  label: "PAC" | "SEDEX",
  code: string
): PacSedexServiceQuote | null {
  if (row.has_error || row.error || row.message) {
    return {
      code,
      label,
      price: 0,
      deliveryDays: 0,
      error: row.error || row.message || "Indisponível",
    };
  }
  const price = parseMoney(row.price);
  const discount = parseMoney(row.discount);
  const days =
    row.delivery_range?.max ??
    row.delivery_range?.min ??
    row.delivery_time ??
    row.delivery_max ??
    row.delivery ??
    row.delivery_min ??
    0;
  if (!Number.isFinite(price) || price <= 0) {
    return {
      code,
      label,
      price: 0,
      deliveryDays: 0,
      error: "Valor indisponível",
    };
  }
  return {
    code,
    label,
    price,
    originalPrice:
      discount > 0 ? Math.round((price + discount) * 100) / 100 : undefined,
    deliveryDays: Math.max(1, Math.round(days)),
  };
}

function normalizeRows(data: unknown): SuperfreteQuoteRow[] {
  if (Array.isArray(data)) return data as SuperfreteQuoteRow[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.results)) return o.results as SuperfreteQuoteRow[];
    if (Array.isArray(o.services)) return o.services as SuperfreteQuoteRow[];
    return [data as SuperfreteQuoteRow];
  }
  return [];
}

export async function fetchSuperfretePacSedexQuote(
  opts: PacSedexQuoteInput
): Promise<PacSedexQuoteResult> {
  const { token, baseUrl } = superfreteConfig();
  const origin = opts.originCep.replace(/\D/g, "");
  const dest = opts.destinationCep.replace(/\D/g, "");
  if (origin.length !== 8 || dest.length !== 8) {
    throw new Error("CEP de origem ou destino inválido.");
  }

  const weight = packageWeightKg(opts.weightKg);
  const body = {
    from: { postal_code: origin },
    to: { postal_code: dest },
    services: `${SUPERFRETE_PAC_ID},${SUPERFRETE_SEDEX_ID}`,
    options: {
      own_hand: false,
      receipt: false,
      insurance_value: 0,
      use_insurance_value: false,
    },
    package: {
      height: DEFAULT_PACKAGE_CM.height,
      width: DEFAULT_PACKAGE_CM.width,
      length: DEFAULT_PACKAGE_CM.length,
      weight,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/v0/calculator`, {
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
          : `SuperFrete indisponível (${res.status}).`;
      throw new Error(msg);
    }

    const rows = normalizeRows(data);
    let pac: PacSedexServiceQuote | null = null;
    let sedex: PacSedexServiceQuote | null = null;

    for (const row of rows) {
      const id = row.service_id ?? row.id;
      const name = row.name?.toUpperCase() ?? "";
      if (id === SUPERFRETE_PAC_ID || name.includes("PAC")) {
        pac = rowToQuote(row, "PAC", String(SUPERFRETE_PAC_ID));
      } else if (id === SUPERFRETE_SEDEX_ID || name.includes("SEDEX")) {
        sedex = rowToQuote(row, "SEDEX", String(SUPERFRETE_SEDEX_ID));
      }
    }

    const pacOk = pac && !pac.error && pac.price > 0;
    const sedexOk = sedex && !sedex.error && sedex.price > 0;
    if (!pacOk && !sedexOk) {
      throw new Error("SuperFrete não retornou PAC/SEDEX para este CEP.");
    }

    return { pac, sedex, provider: "superfrete" };
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error("SuperFrete demorou para responder. Tente novamente.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
