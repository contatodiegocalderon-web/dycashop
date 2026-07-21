import { adminPurpleCardStyle } from "@/components/admin/admin-purple-card";

export function OrderDaySectionHeader({ label }: { label: string }) {
  return (
    <h2
      className="sticky top-0 z-10 -mx-1 rounded-xl border border-violet-400/30 px-3 py-2.5 text-center text-lg font-bold uppercase tracking-wide text-white shadow-md shadow-violet-950/25 ring-1 ring-inset ring-white/15 backdrop-blur-sm"
      style={adminPurpleCardStyle}
    >
      {label}
    </h2>
  );
}
