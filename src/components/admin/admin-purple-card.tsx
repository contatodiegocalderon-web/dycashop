import type { ReactNode } from "react";

export const adminPurpleCardStyle: React.CSSProperties = {
  background:
    "radial-gradient(120% 90% at 0% 0%, rgba(167, 139, 250, 0.22) 0%, transparent 55%), radial-gradient(90% 70% at 100% 100%, rgba(192, 132, 252, 0.15) 0%, transparent 50%), linear-gradient(145deg, #2e106b 0%, #4c1d95 38%, #3b0764 72%, #1e1b4b 100%)",
};

const shellClass =
  "relative overflow-hidden rounded-2xl border border-violet-400/25 shadow-xl shadow-violet-950/30 ring-1 ring-inset ring-white/10";

export function AdminPurpleCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${shellClass} ${className}`.trim()} style={adminPurpleCardStyle}>
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.02)_28%,transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
        aria-hidden
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function AdminPurpleStatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <AdminPurpleCard className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-violet-200/80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-xs text-violet-100/70">{sub}</p>
      ) : null}
    </AdminPurpleCard>
  );
}
