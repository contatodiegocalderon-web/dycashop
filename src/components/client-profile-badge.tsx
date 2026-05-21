import type { BusinessProfile } from "@/lib/client-follow-up";

const PROFILE_LABEL: Record<BusinessProfile, string> = {
  lojista: "Lojista",
  revendedor: "Revendedor",
};

const PROFILE_STYLES: Record<BusinessProfile, string> = {
  lojista: "bg-orange-100 text-orange-950 ring-orange-300/70",
  revendedor: "bg-fuchsia-100 text-fuchsia-950 ring-fuchsia-300/70",
};

export function ClientProfileBadge({ profile }: { profile: BusinessProfile }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PROFILE_STYLES[profile]}`}
    >
      {PROFILE_LABEL[profile]}
    </span>
  );
}
