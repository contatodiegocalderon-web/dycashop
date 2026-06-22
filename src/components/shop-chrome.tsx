"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { rememberCatalogReturnUrl } from "@/lib/catalog-return-url";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Cabeçalho da loja + carrinho + rodapé só para clientes; `/admin` fica só com o painel. */
export function ShopChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const admin = path?.startsWith("/admin") ?? false;

  useEffect(() => {
    if (!path) return;
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    rememberCatalogReturnUrl(path, search);
  }, [path]);

  if (admin) {
    return <>{children}</>;
  }

  return (
    <>
      <SiteHeader />
      <main className="min-page flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
