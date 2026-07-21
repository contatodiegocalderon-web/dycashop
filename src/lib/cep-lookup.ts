export type CepAddress = {
  city: string;
  state: string;
};

export type CepFullAddress = CepAddress & {
  street: string;
  district: string;
};

const VIACEP_TIMEOUT_MS = 8_000;

type ViaCepJson = {
  erro?: boolean;
  localidade?: string;
  uf?: string;
  logradouro?: string;
  bairro?: string;
};

async function fetchViaCep(cepDigits: string): Promise<ViaCepJson | null> {
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
    const data = (await res.json()) as ViaCepJson;
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
  const data = await fetchViaCep(cepDigits);
  if (!data) return null;
  const city = String(data.localidade ?? "").trim();
  const state = String(data.uf ?? "").trim();
  if (!city || !state) return null;
  return { city, state };
}

/** Endereço completo (rua/bairro/cidade/UF) para formulário de etiqueta. */
export async function lookupCepFullAddress(
  cepDigits: string
): Promise<CepFullAddress | null> {
  const data = await fetchViaCep(cepDigits);
  if (!data) return null;
  const city = String(data.localidade ?? "").trim();
  const state = String(data.uf ?? "").trim().toUpperCase();
  if (!city || !state) return null;
  return {
    street: String(data.logradouro ?? "").trim(),
    district: String(data.bairro ?? "").trim(),
    city,
    state,
  };
}

export function formatCepCityState(address: CepAddress): string {
  return `${address.city}/${address.state}`;
}
