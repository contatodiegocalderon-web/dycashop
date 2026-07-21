import { NextRequest, NextResponse } from "next/server";
import { lookupCepFullAddress } from "@/lib/cep-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cep?cep=04015001 — preenche endereço (ViaCEP) para etiqueta. */
export async function GET(request: NextRequest) {
  const cep = String(request.nextUrl.searchParams.get("cep") ?? "").replace(
    /\D/g,
    ""
  );
  if (cep.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 });
  }

  const address = await lookupCepFullAddress(cep);
  if (!address) {
    return NextResponse.json(
      { error: "CEP não encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    cep,
    street: address.street,
    district: address.district,
    city: address.city,
    state: address.state,
  });
}
