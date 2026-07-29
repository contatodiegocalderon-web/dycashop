/** Classes e UI de erro para campos obrigatórios no checkout. */

export function requiredInputClass(invalid: boolean, extra = "") {
  const base =
    "w-full rounded-lg bg-black/30 px-3 py-2 pr-10 text-sm text-stone-100 outline-none";
  const border = invalid
    ? "border border-red-500 focus:ring-2 focus:ring-red-500/30"
    : "border border-white/10 focus:ring-2 focus:ring-white/15";
  return `${base} ${border}${extra ? ` ${extra}` : ""}`;
}

export function FieldInvalidMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="pointer-events-none absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold leading-none text-white"
      aria-hidden
    >
      ×
    </span>
  );
}

export function FieldRequiredHint({
  show,
  message = "Este campo deve ser preenchido",
}: {
  show: boolean;
  message?: string;
}) {
  if (!show) return null;
  return (
    <p className="mt-1 text-center text-xs text-red-500" role="alert">
      {message}
    </p>
  );
}
