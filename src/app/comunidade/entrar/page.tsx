import type { Metadata } from "next";
import { DropLogin } from "@/components/drop-login";

export const metadata: Metadata = {
  title: "Entrar · comunidade DYCASHOP",
  description: "Acesso da comunidade de parceiros DYCASHOP.",
};

export default function DropLoginPage() {
  return <DropLogin />;
}
