import type { Metadata } from "next";
import { DropClaim } from "@/components/drop-claim";

export const metadata: Metadata = {
  title: "Criar acesso · comunidade DYCASHOP",
  description: "Crie seu acesso à comunidade de parceiros DYCASHOP.",
};

export default function DropClaimPage() {
  return <DropClaim />;
}
