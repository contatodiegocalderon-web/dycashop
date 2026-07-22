"use client";

import { useEffect, useMemo, useState } from "react";
import { lookupCepFull } from "@/lib/cep-lookup";
import { normalizeCepDigits } from "@/lib/cart-shipping-weight";
import { formatCpfInput, isValidCpf, normalizeCpfDigits } from "@/lib/cpf";
import type { ShippingAddress } from "@/lib/shipping-address";

type Props = {
  cep: string;
  customerName: string;
  onChange: (address: ShippingAddress | null) => void;
};

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

export function CartVarejoShippingAddress({
  cep,
  customerName,
  onChange,
}: Props) {
  const cepDigits = useMemo(() => normalizeCepDigits(cep) ?? "", [cep]);
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [cpf, setCpf] = useState("");
  const [cityFromCep, setCityFromCep] = useState(false);
  const [stateFromCep, setStateFromCep] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    if (cepDigits.length !== 8) {
      setCityFromCep(false);
      setStateFromCep(false);
      return;
    }

    let cancelled = false;
    setLoadingCep(true);
    void lookupCepFull(cepDigits).then((addr) => {
      if (cancelled) return;
      if (!addr) {
        setLoadingCep(false);
        return;
      }
      setStreet(addr.street);
      setNeighborhood(addr.neighborhood);
      setCity(addr.city);
      setState(addr.state);
      setCityFromCep(true);
      setStateFromCep(true);
      setLoadingCep(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cepDigits]);

  useEffect(() => {
    const trimmedName = customerName.trim();
    const cpfDigits = normalizeCpfDigits(cpf);
    if (
      !cepDigits ||
      cepDigits.length !== 8 ||
      !isValidCpf(cpfDigits) ||
      !street.trim() ||
      !number.trim() ||
      !neighborhood.trim() ||
      !city.trim() ||
      state.trim().length !== 2
    ) {
      onChange(null);
      return;
    }

    onChange({
      street: street.trim(),
      number: number.trim(),
      complement: complement.trim() || null,
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      cep: cepDigits,
      cpf: cpfDigits,
      recipientName: trimmedName || null,
    });
  }, [
    cepDigits,
    cpf,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    customerName,
    onChange,
  ]);

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-zinc-950/40 p-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-200">
          Endereço de entrega
        </h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Preencha o endereço para envio via SuperFrete.
          {loadingCep ? " Buscando CEP…" : null}
        </p>
      </div>

      <div>
        <label htmlFor="shipping-cpf" className="text-sm font-medium text-stone-300">
          CPF <span className="text-red-400">*</span>
        </label>
        <input
          id="shipping-cpf"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={cpf}
          onChange={(e) => setCpf(formatCpfInput(e.target.value))}
          maxLength={14}
          placeholder="000.000.000-00"
          className="mt-2 w-full max-w-xs rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm tabular-nums text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
        />
      </div>

      <div>
        <label htmlFor="shipping-street" className="text-sm font-medium text-stone-300">
          Rua <span className="text-red-400">*</span>
        </label>
        <input
          id="shipping-street"
          type="text"
          autoComplete="address-line1"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          maxLength={200}
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="shipping-number" className="text-sm font-medium text-stone-300">
            Número <span className="text-red-400">*</span>
          </label>
          <input
            id="shipping-number"
            type="text"
            autoComplete="address-line2"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            maxLength={20}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
          />
        </div>
        <div>
          <label htmlFor="shipping-complement" className="text-sm font-medium text-stone-300">
            Complemento
          </label>
          <input
            id="shipping-complement"
            type="text"
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
            maxLength={120}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
          />
        </div>
      </div>

      <div>
        <label htmlFor="shipping-neighborhood" className="text-sm font-medium text-stone-300">
          Bairro <span className="text-red-400">*</span>
        </label>
        <input
          id="shipping-neighborhood"
          type="text"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          maxLength={120}
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="shipping-city" className="text-sm font-medium text-stone-300">
            Cidade <span className="text-red-400">*</span>
          </label>
          <input
            id="shipping-city"
            type="text"
            autoComplete="address-level2"
            value={city}
            readOnly={cityFromCep}
            onChange={(e) => setCity(e.target.value)}
            maxLength={120}
            className={`mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-white/15 ${
              cityFromCep ? "cursor-not-allowed bg-black/20" : "bg-black/30"
            }`}
          />
        </div>
        <div>
          <label htmlFor="shipping-state" className="text-sm font-medium text-stone-300">
            UF <span className="text-red-400">*</span>
          </label>
          {stateFromCep ? (
            <input
              id="shipping-state"
              type="text"
              value={state}
              readOnly
              className="mt-2 w-full cursor-not-allowed rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm uppercase text-stone-100 outline-none"
            />
          ) : (
            <select
              id="shipping-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm uppercase text-stone-100 outline-none focus:ring-2 focus:ring-white/15"
            >
              <option value="">—</option>
              {UF_OPTIONS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
