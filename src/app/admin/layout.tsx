import { AdminAuthProvider } from "@/contexts/admin-auth";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}
