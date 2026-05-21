import { redirect } from "next/navigation";

/** Carrinhos abandonados passaram para a aba dentro de Clientes. */
export default function CarrinhosAbandonadosRedirectPage() {
  redirect("/admin/clientes?tab=abandonados");
}
