/** Códigos de serviço Correios (balcão / sem contrato). */
export const CORREIOS_PAC_CODE = "04510";
export const CORREIOS_SEDEX_CODE = "04014";

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
  const prazoRaw = block.match(/<PrazoEntrega>(\d+)<\/PrazoEntrega>/i)?.[1] ?? "0";
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
    deliveryDays: Number.isFinite(deliveryDays) && deliveryDays > 0 ? deliveryDays : 1,
  };
}

/**
 * Cota PAC e SEDEX via webservice público dos Correios (balcão, sem contrato).
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
  const params = new URLSearchParams({
    nCdEmpresa: "",
    sDsSenha: "",
    nCdServico: `${CORREIOS_PAC_CODE},${CORREIOS_SEDEX_CODE}`,
    sCepOrigem: origin,
    sCepDestino: dest,
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

  const url = `https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/xml,text/xml,*/*" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Correios indisponível (${res.status}).`);
  }
  const xml = await res.text();
  if (!xml.includes("cServico") && !xml.includes("Servicos")) {
    throw new Error("Resposta inválida dos Correios.");
  }

  const blocks = xml.match(/<cServico>[\s\S]*?<\/cServico>/gi) ?? [];
  let pac: CorreiosServiceQuote | null = null;
  let sedex: CorreiosServiceQuote | null = null;

  for (const block of blocks) {
    const codigo = block.match(/<Codigo>(\d+)<\/Codigo>/i)?.[1] ?? "";
    if (codigo === CORREIOS_PAC_CODE || codigo.endsWith("4510")) {
      pac = parseServiceBlock(block, "PAC", CORREIOS_PAC_CODE);
    } else if (codigo === CORREIOS_SEDEX_CODE || codigo.endsWith("4014")) {
      sedex = parseServiceBlock(block, "SEDEX", CORREIOS_SEDEX_CODE);
    }
  }

  if (!pac && !sedex) {
    throw new Error("Não foi possível obter cotação PAC/SEDEX para este CEP.");
  }

  return { pac, sedex };
}

export function formatDeliveryDaysRange(days: number): string {
  const max = Math.max(1, Math.round(days));
  return `1 A ${max} DIAS ÚTEIS`;
}

export function formatFreightMoneyBrl(price: number): string {
  const rounded = Math.round(price * 100) / 100;
  const [intPart, dec] = rounded.toFixed(2).split(".");
  return `R$ ${intPart},${dec}`;
}
