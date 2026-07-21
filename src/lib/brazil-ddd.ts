/** UF brasileira (sigla de 2 letras). */
export type BrazilUf =
  | "AC"
  | "AL"
  | "AM"
  | "AP"
  | "BA"
  | "CE"
  | "DF"
  | "ES"
  | "GO"
  | "MA"
  | "MG"
  | "MS"
  | "MT"
  | "PA"
  | "PB"
  | "PE"
  | "PI"
  | "PR"
  | "RJ"
  | "RN"
  | "RO"
  | "RR"
  | "RS"
  | "SC"
  | "SE"
  | "SP"
  | "TO";

export const BRAZIL_UF_LABELS: Record<BrazilUf, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins",
};

export const ALL_BRAZIL_UFS: BrazilUf[] = Object.keys(
  BRAZIL_UF_LABELS
) as BrazilUf[];

/** DDD → UF (conforme tabela fornecida; 61 → DF por ser código da capital). */
const DDD_TO_UF: Record<string, BrazilUf> = {
  "11": "SP",
  "12": "SP",
  "13": "SP",
  "14": "SP",
  "15": "SP",
  "16": "SP",
  "17": "SP",
  "18": "SP",
  "19": "SP",
  "21": "RJ",
  "22": "RJ",
  "24": "RJ",
  "27": "ES",
  "28": "ES",
  "31": "MG",
  "32": "MG",
  "33": "MG",
  "34": "MG",
  "35": "MG",
  "37": "MG",
  "38": "MG",
  "41": "PR",
  "42": "PR",
  "43": "PR",
  "44": "PR",
  "45": "PR",
  "46": "PR",
  "47": "SC",
  "48": "SC",
  "49": "SC",
  "51": "RS",
  "53": "RS",
  "54": "RS",
  "55": "RS",
  "61": "DF",
  "62": "GO",
  "63": "TO",
  "64": "GO",
  "65": "MT",
  "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA",
  "73": "BA",
  "74": "BA",
  "75": "BA",
  "77": "BA",
  "79": "SE",
  "81": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE",
  "86": "PI",
  "87": "PE",
  "88": "CE",
  "89": "PI",
  "91": "PA",
  "92": "AM",
  "93": "PA",
  "94": "PA",
  "95": "RR",
  "96": "AP",
  "97": "AM",
  "98": "MA",
  "99": "MA",
};

/** id do @svg-maps/brazil (minúsculas) → UF */
export const SVG_STATE_ID_TO_UF: Record<string, BrazilUf> = {
  ac: "AC",
  al: "AL",
  am: "AM",
  ap: "AP",
  ba: "BA",
  ce: "CE",
  df: "DF",
  es: "ES",
  go: "GO",
  ma: "MA",
  mg: "MG",
  ms: "MS",
  mt: "MT",
  pa: "PA",
  pb: "PB",
  pe: "PE",
  pi: "PI",
  pr: "PR",
  rj: "RJ",
  rn: "RN",
  ro: "RO",
  rr: "RR",
  rs: "RS",
  sc: "SC",
  se: "SE",
  sp: "SP",
  to: "TO",
};

export function ufFromSvgStateId(id: string): BrazilUf | null {
  return SVG_STATE_ID_TO_UF[id.toLowerCase()] ?? null;
}

/**
 * Extrai DDD de WhatsApp brasileiro (só dígitos).
 * Aceita 55 + DDD + número ou DDD + número local.
 */
export function extractDddFromWhatsapp(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length < 10) return null;

  let local = d;
  if (local.startsWith("55") && local.length >= 12) {
    local = local.slice(2);
  }

  if (local.length < 10) return null;
  const ddd = local.slice(0, 2);
  if (!/^\d{2}$/.test(ddd)) return null;
  return ddd;
}

export function ufFromWhatsapp(digits: string): BrazilUf | null {
  const ddd = extractDddFromWhatsapp(digits);
  if (!ddd) return null;
  return DDD_TO_UF[ddd] ?? null;
}
