import { AdminHomeCards } from "@/components/admin/admin-home-cards";

const titleShadow =
  "[text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]";

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1
        className={`mb-7 text-3xl font-bold tracking-tight text-white ${titleShadow}`}
      >
        Painel Administrativo
      </h1>

      <AdminHomeCards />
    </div>
  );
}
