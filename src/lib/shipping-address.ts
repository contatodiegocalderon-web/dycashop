export type ShippingAddress = {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  cpf: string;
  recipientName?: string | null;
};

import { isValidCpf, normalizeCpfDigits } from "@/lib/cpf";

const MAX_STREET = 200;
const MAX_NUMBER = 20;
const MAX_COMPLEMENT = 120;
const MAX_NEIGHBORHOOD = 120;
const MAX_CITY = 120;
const MAX_STATE = 2;
const MAX_NAME = 120;

function trimField(value: unknown, maxLen: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, maxLen);
}

export function normalizeShippingAddress(
  raw: unknown
): ShippingAddress | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cep = String(o.cep ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
  const street = trimField(o.street ?? o.rua, MAX_STREET);
  const number = trimField(o.number ?? o.numero, MAX_NUMBER);
  const neighborhood = trimField(
    o.neighborhood ?? o.bairro,
    MAX_NEIGHBORHOOD
  );
  const city = trimField(o.city ?? o.cidade, MAX_CITY);
  const state = trimField(o.state ?? o.uf, MAX_STATE).toUpperCase();
  const complementRaw = o.complement ?? o.complemento;
  const complement =
    complementRaw == null || String(complementRaw).trim() === ""
      ? null
      : trimField(complementRaw, MAX_COMPLEMENT);
  const recipientNameRaw = o.recipientName ?? o.recipient_name;
  const recipientName =
    recipientNameRaw == null || String(recipientNameRaw).trim() === ""
      ? null
      : trimField(recipientNameRaw, MAX_NAME);
  const cpf = normalizeCpfDigits(String(o.cpf ?? ""));

  if (
    cep.length !== 8 ||
    !street ||
    !number ||
    !neighborhood ||
    !city ||
    state.length !== 2 ||
    !isValidCpf(cpf)
  ) {
    return null;
  }

  return {
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    cep,
    cpf,
    recipientName,
  };
}

export function validateShippingAddress(
  raw: unknown
): { ok: true; value: ShippingAddress } | { ok: false; error: string } {
  const value = normalizeShippingAddress(raw);
  if (!value) {
    return {
      ok: false,
      error:
        "Informe o endereço completo: CPF válido, rua, número, bairro, cidade, UF e CEP.",
    };
  }
  return { ok: true, value };
}
