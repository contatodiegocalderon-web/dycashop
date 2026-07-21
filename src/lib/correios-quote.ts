/** Códigos de serviço Correios (balcão / sem contrato). */
export const CORREIOS_PAC_CODE = "04510";
export const CORREIOS_SEDEX_CODE = "04014";

const CORREIOS_CALC_URL =
  "https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx";
const CORREIOS_FETCH_TIMEOUT_MS = 12_000;

export type CorreiosServiceQuote = {
  code: string;
  label: "PAC" | "SEDEX";
  price: number;
  /** Prazo em dias úteis informado pelos Correios. */
  deliveryDays: number;
  error?: string;
};

export type CorreiosQuoteResult = {
  pac: CorreiosServiceQuote | null;
  sedex: CorreiosServiceQuote | null;
};

function parseBrazilianMoney(raw: string): number {
  const n = Number(raw.replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseServiceBlock(
  block: string,
  label: "PAC" | "SEDEX",
  expectedCode: string
): CorreiosServiceQuote | null {
  const codigo = block.match(/<Codigo>(\d+)<\/Codigo>/i)?.[1] ?? "";
  const erro = block.match(/<Erro>(-?\d+)<\/Erro>/i)?.[1] ?? "0";
  const msgErro = block.match(/<MsgErro>([^<]*)<\/MsgErro>/i)?.[1]?.trim();
  if (erro !== "0" && erro !== "010") {
    return {
      code: expectedCode,
      label,
      price: 0,
      deliveryDays: 0,
      error: msgErro || `Erro Correios ${erro}`,
    };
  }
  const valorRaw = block.match(/<Valor>([^<]+)<\/Valor>/i)?.[1] ?? "0";
  const prazoRaw =
    block.match(/<PrazoEntrega>(\d+)<\/PrazoEntrega>/i)?.[1] ?? "0";
  const price = parseBrazilianMoney(valorRaw);
  const deliveryDays = Number.parseInt(prazoRaw, 10);
  if (!Number.isFinite(price) || price <= 0) {
    return {
      code: codigo || expectedCode,
      label,
      price: 0,
      deliveryDays: 0,
      error: msgErro || "Valor indisponível",
    };
  }
  return {
    code: codigo || expectedCode,
    label,
    price,
    deliveryDays:
      Number.isFinite(deliveryDays) && deliveryDays > 0 ? deliveryDays : 1,
  };
}

async function fetchCorreiosXml(
  params: URLSearchParams,
  signal?: AbortSignal
): Promise<string> {
  const url = `${CORREIOS_CALC_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/xml,text/xml,*/*" },
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`Correios indisponível (${res.status}).`);
  }
  const xml = await res.text();
  if (!xml.includes("cServico") && !xml.includes("Servicos")) {
    throw new Error("Resposta inválida dos Correios.");
  }
  return xml;
}

async function fetchSingleServiceQuote(opts: {
  originCep: string;
  destinationCep: string;
  weightKg: number;
  serviceCode: string;
  label: "PAC" | "SEDEX";
}): Promise<CorreiosServiceQuote | null> {
  const weightKg = Math.max(0.1, Math.min(30, opts.weightKg));
  const params = new URLSearchParams({
    nCdEmpresa: "",
    sDsSenha: "",
    nCdServico: opts.serviceCode,
    sCepOrigem: opts.originCep,
    sCepDestino: opts.destinationCep,
    nVlPeso: weightKg.toFixed(2).replace(".", ","),
    nCdFormato: "1",
    nVlComprimento: "25",
    nVlAltura: "12",
    nVlLargura: "20",
    nVlDiametro: "0",
    sCdMaoPropria: "n",
    nVlValorDeclarado: "0",
    sCdAvisoRecebimento: "n",
    StrRetorno: "xml",
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CORREIOS_FETCH_TIMEOUT_MS
  );

  try {
    const xml = await fetchCorreiosXml(params, controller.signal);
    const blocks = xml.match(/<cServico>[\s\S]*?<\/cServico>/gi) ?? [];
    const block = blocks[0];
    if (!block) return null;
    return parseServiceBlock(block, opts.label, opts.serviceCode);
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(
        "Os Correios demoraram para responder. Tente novamente em instantes."
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cota PAC e SEDEX via webservice público dos Correios (balcão, sem contrato).
 * Consultas em paralelo com timeout para evitar travamento.
 */
export async function fetchCorreiosPacSedexQuote(opts: {
  originCep: string;
  destinationCep: string;
  weightKg: number;
}): Promise<CorreiosQuoteResult> {
  const origin = opts.originCep.replace(/\D/g, "");
  const dest = opts.destinationCep.replace(/\D/g, "");
  if (origin.length !== 8 || dest.length !== 8) {
    throw new Error("CEP de origem ou destino inválido.");
  }

  const weightKg = Math.max(0.1, Math.min(30, opts.weightKg));
  const base = { originCep: origin, destinationCep: dest, weightKg };

  const [pacResult, sedexResult] = await Promise.allSettled([
    fetchSingleServiceQuote({
      ...base,
      serviceCode: CORREIOS_PAC_CODE,
      label: "PAC",
    }),
    fetchSingleServiceQuote({
      ...base,
      serviceCode: CORREIOS_SEDEX_CODE,
      label: "SEDEX",
    }),
  ]);

  const pac =
    pacResult.status === "fulfilled" ? pacResult.value : null;
  const sedex =
    sedexResult.status === "fulfilled" ? sedexResult.value : null;

  const pacOk = pac && !pac.error && pac.price > 0;
  const sedexOk = sedex && !sedex.error && sedex.price > 0;

  if (!pacOk && !sedexOk) {
    const reason =
      (pacResult.status === "rejected"
        ? pacResult.reason
        : sedexResult.status === "rejected"
          ? sedexResult.reason
          : null) ??
      pac?.error ??
      sedex?.error;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Não foi possível obter cotação PAC/SEDEX para este CEP.";
    throw new Error(msg);
  }

  return { pac, sedex };
}

export function formatDeliveryDaysRange(days: number): string {
  const max = Math.max(1, Math.round(days));
  if (max === 1) return "Até 1 dia útil";
  return `Até ${max} dias úteis`;
}

export function formatFreightMoneyBrl(price: number): string {
  const rounded = Math.round(price * 100) / 100;
  const [intPart, dec] = rounded.toFixed(2).split(".");
  return `R$ ${intPart},${dec}`;
}
