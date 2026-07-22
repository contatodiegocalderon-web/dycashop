export type CepAddress = {
  city: string;
  state: string;
};

export type CepFullAddress = CepAddress & {
  street: string;
  neighborhood: string;
  cep: string;
};

const VIACEP_TIMEOUT_MS = 8_000;

type ViaCepResponse = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  cep?: string;
};

async function fetchViaCep(cepDigits: string): Promise<ViaCepResponse | null> {
  const cep = cepDigits.replace(/\D/g, "");
  if (cep.length !== 8) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIACEP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCepResponse;
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cidade/UF a partir do CEP (ViaCEP). */
export async function lookupCepAddress(
  cepDigits: string
): Promise<CepAddress | null> {
  const full = await lookupCepFull(cepDigits);
  return full ? { city: full.city, state: full.state } : null;
}

/** Endereço completo a partir do CEP (ViaCEP). */
export async function lookupCepFull(
  cepDigits: string
): Promise<CepFullAddress | null> {
  const data = await fetchViaCep(cepDigits);
  if (!data) return null;
  const street = String(data.logradouro ?? "").trim();
  const neighborhood = String(data.bairro ?? "").trim();
  const city = String(data.localidade ?? "").trim();
  const state = String(data.uf ?? "").trim().toUpperCase();
  const cep = String(data.cep ?? cepDigits.replace(/\D/g, ""))
    .replace(/\D/g, "")
    .slice(0, 8);
  if (!street || !neighborhood || !city || !state || cep.length !== 8) {
    return null;
  }
  return { street, neighborhood, city, state, cep };
}

export function formatCepCityState(address: CepAddress): string {
  return `${address.city}/${address.state}`;
}
