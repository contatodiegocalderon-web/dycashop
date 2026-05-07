"use client";

import dynamic from "next/dynamic";

const AdminPedidosClient = dynamic(
  () => import("./AdminPedidosClient"),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center text-sm text-stone-500">
        A carregar pedidos…
      </div>
    ),
  }
);

export default function AdminPedidosPage() {
  return <AdminPedidosClient />;
}
