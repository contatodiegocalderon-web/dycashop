import type { Metadata } from "next";
import { DropCommunity } from "@/components/drop-community";

export const metadata: Metadata = {
  title: "Comunidade · DYCASHOP",
  description: "Área dos parceiros de dropshipping DYCASHOP.",
};

export default function ComunidadePage() {
  return <DropCommunity />;
}
