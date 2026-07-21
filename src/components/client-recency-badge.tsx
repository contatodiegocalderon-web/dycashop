import {
  clientRecencyLabel,
  type ClientRecencyStatus,
} from "@/lib/client-recency";

const STYLES: Record<Exclude<ClientRecencyStatus, "none">, string> = {
  green: "bg-emerald-100 text-emerald-900 ring-emerald-300/60",
  yellow: "bg-amber-100 text-amber-950 ring-amber-300/60",
  red: "bg-red-100 text-red-900 ring-red-300/60",
};

export function ClientRecencyBadge({ status }: { status: ClientRecencyStatus }) {
  if (status === "none") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" aria-hidden />
        Sem compra
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STYLES[status]}`}
      title={clientRecencyLabel(status)}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          status === "green"
            ? "bg-emerald-500"
            : status === "yellow"
              ? "bg-amber-500"
              : "bg-red-500"
        }`}
        aria-hidden
      />
      {clientRecencyLabel(status)}
    </span>
  );
}
