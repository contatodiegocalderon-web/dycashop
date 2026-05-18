import { CatalogPublicLink } from "@/components/admin/catalog-public-link";
import { AdminHomeCards } from "@/components/admin/admin-home-cards";

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-7">
        <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
          Painel administrativo
        </h1>
        <p className="mt-2 text-sm text-stone-700">
          Área da equipa para operação de vendas, clientes e catálogo.
        </p>
      </div>

      <div className="mb-7">
        <CatalogPublicLink />
      </div>

      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Módulos operacionais
          </h2>
          <p className="mt-1 text-sm text-stone-700">
            Acesso rápido com visual profissional e contraste alto.
          </p>
        </div>
      </div>

      <AdminHomeCards />
    </div>
  );
}
