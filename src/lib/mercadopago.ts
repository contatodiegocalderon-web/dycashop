import fs from "node:fs";
import path from "node:path";

export type MercadoPagoConfig = {
  accessToken: string;
};

export type CheckoutPreferenceItem = {
  title: string;
  quantity: number;
  unitPrice: number;
};

export type CreateCheckoutPreferenceInput = {
  orderId: string;
  displayNumber: number;
  items: CheckoutPreferenceItem[];
  shippingPrice: number;
  shippingLabel?: string;
  payerName: string;
  payerPhone: string;
  payerCpf?: string;
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl: string;
};

export type CheckoutPreferenceResult = {
  id: string;
  initPoint: string;
  sandboxInitPoint?: string;
};

export type MercadoPagoPayment = {
  id: number;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number;
};

const MP_ENV_KEYS = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MP_ACCESS_TOKEN",
  "MERCADOPAGO_TOKEN",
] as const;

function parseEnvLineValue(raw: string): string {
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v.trim();
}

function readEnvFileValue(key: string): string | undefined {
  const root = process.cwd();
  for (const filename of [".env.local", ".env"]) {
    try {
      const filePath = path.join(root, filename);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const lineKey = trimmed.slice(0, eq).trim();
        if (lineKey !== key) continue;
        const value = parseEnvLineValue(trimmed.slice(eq + 1));
        if (value) return value;
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function resolveMercadoPagoAccessToken(): string {
  for (const key of MP_ENV_KEYS) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  for (const key of MP_ENV_KEYS) {
    const fromFile = readEnvFileValue(key);
    if (fromFile) return fromFile;
  }
  return "";
}

export function mercadopagoConfig(): MercadoPagoConfig {
  const accessToken = resolveMercadoPagoAccessToken();
  if (!accessToken) {
    throw new Error(
      "MERCADOPAGO_ACCESS_TOKEN não configurado no servidor. " +
        "Confira .env.local ou .env na raiz do projeto (Next.js prioriza .env.local) e reinicie o servidor. " +
        "Na Vercel: Settings → Environment Variables (Production) + redeploy."
    );
  }
  return { accessToken };
}

function mpAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function isLocalHostUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return true;
  }
}

export async function createCheckoutPreference(
  input: CreateCheckoutPreferenceInput
): Promise<CheckoutPreferenceResult> {
  const { accessToken } = mercadopagoConfig();

  const success = input.backUrls.success?.trim();
  const failure = input.backUrls.failure?.trim();
  const pending = input.backUrls.pending?.trim();
  if (!success || !failure || !pending) {
    throw new Error("URLs de retorno do Mercado Pago incompletas.");
  }

  const mpItems = input.items.map((item) => ({
    title: item.title.slice(0, 256),
    quantity: item.quantity,
    unit_price: Number(item.unitPrice.toFixed(2)),
    currency_id: "BRL",
  }));

  if (input.shippingPrice > 0) {
    mpItems.push({
      title: (input.shippingLabel ?? "Frete").slice(0, 256),
      quantity: 1,
      unit_price: Number(input.shippingPrice.toFixed(2)),
      currency_id: "BRL",
    });
  }

  const phoneDigits = input.payerPhone.replace(/\D/g, "");
  const national = phoneDigits.startsWith("55")
    ? phoneDigits.slice(2)
    : phoneDigits;
  const areaCode = national.slice(0, 2);
  const number = national.slice(2);
  const cpfDigits = input.payerCpf?.replace(/\D/g, "").slice(0, 11);

  const body: Record<string, unknown> = {
    items: mpItems,
    payer: {
      name: input.payerName.slice(0, 120),
      phone: areaCode && number ? { area_code: areaCode, number } : undefined,
      identification:
        cpfDigits && cpfDigits.length === 11
          ? { type: "CPF", number: cpfDigits }
          : undefined,
    },
    back_urls: {
      success,
      failure,
      pending,
    },
    external_reference: input.orderId,
    notification_url: input.notificationUrl,
    statement_descriptor: `Pedido #${input.displayNumber}`.slice(0, 22),
  };

  // MP rejeita auto_return com localhost; exige URL pública (https) válida.
  if (!isLocalHostUrl(success)) {
    body.auto_return = "approved";
  }

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: mpAuthHeaders(accessToken),
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.message ?? data.error ?? "Falha ao criar preferência Mercado Pago."
    );
  }

  if (!data.id || !data.init_point) {
    throw new Error("Resposta inválida do Mercado Pago.");
  }

  return {
    id: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
  };
}

export async function getMercadoPagoPayment(
  paymentId: string | number
): Promise<MercadoPagoPayment | null> {
  const { accessToken } = mercadopagoConfig();
  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) return null;
  return (await res.json()) as MercadoPagoPayment;
}
