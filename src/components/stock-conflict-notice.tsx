type Props = {
  variant: "client" | "admin";
};

/** Aviso curto; o detalhe fica no label «esgotado» de cada peça. */
export function StockConflictNotice({ variant }: Props) {
  const isAdmin = variant === "admin";
  const boxClass = isAdmin
    ? "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
    : "rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-sm font-semibold text-amber-100";

  return (
    <div className={boxClass}>
      {isAdmin
        ? "PEÇA ESGOTADA"
        : "Alguma peça que você escolheu esgotou, confira e faça a troca com o vendedor!"}
    </div>
  );
}
