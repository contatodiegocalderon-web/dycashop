"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Cabeçalho da loja + carrinho + rodapé só para clientes; `/admin` fica só com o painel. */
export function ShopChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const admin = path?.startsWith("/admin") ?? false;

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
