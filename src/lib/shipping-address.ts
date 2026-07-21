/** Dados do destinatário para etiqueta SuperFrete / Correios. */

export type ShippingAddressInput = {
  cpf: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
};

export function digitsOnly(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCpfMask(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

/** Validação CPF (dígitos verificadores). */
export function isValidCpf(value: string): boolean {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(cpf[10]);
}

export function normalizeShippingAddress(
  raw: Partial<ShippingAddressInput> | null | undefined
): ShippingAddressInput | null {
  if (!raw || typeof raw !== "object") return null;
  const cpf = digitsOnly(String(raw.cpf ?? ""));
  const street = String(raw.street ?? "").trim();
  const number = String(raw.number ?? "").trim();
  const complement = String(raw.complement ?? "").trim();
  const district = String(raw.district ?? "").trim();
  const city = String(raw.city ?? "").trim();
  const state = String(raw.state ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  if (!isValidCpf(cpf)) return null;
  if (!street || !number || !district || !city || state.length !== 2) return null;

  return {
    cpf,
    street,
    number,
    ...(complement ? { complement } : {}),
    district,
    city,
    state,
  };
}

export function formatShippingAddressNote(
  address: ShippingAddressInput,
  customerName: string
): string {
  const line = [
    address.street,
    address.number,
    address.complement,
    address.district,
    `${address.city}/${address.state}`,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    `Destinatário: ${customerName.trim()}`,
    `CPF: ${formatCpfMask(address.cpf)}`,
    `Endereço: ${line}`,
  ].join(" | ");
}
