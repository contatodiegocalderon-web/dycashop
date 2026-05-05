import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-stone-100">Página não encontrada</h1>
      <Link href="/" className="mt-4 inline-block text-stone-400 transition-colors hover:text-stone-200">
        Voltar ao catálogo
      </Link>
    </div>
  );
}
