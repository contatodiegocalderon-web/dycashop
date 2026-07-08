export type CepAddress = {
  city: string;
  state: string;
};

const VIACEP_TIMEOUT_MS = 8_000;

/** Cidade/UF a partir do CEP (ViaCEP). */
export async function lookupCepAddress(
  cepDigits: string
): Promise<CepAddress | null> {
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
    const data = (await res.json()) as {
      erro?: boolean;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    const city = String(data.localidade ?? "").trim();
    const state = String(data.uf ?? "").trim();
    if (!city || !state) return null;
    return { city, state };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatCepCityState(address: CepAddress): string {
  return `${address.city}/${address.state}`;
}
