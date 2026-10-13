import type { Metadata } from "next";
import { CommunityShell } from "@/components/community/community-shell";
import { JourneyView } from "@/components/community/journey";

export const metadata: Metadata = {
  title: "Sua jornada · comunidade DYCASHOP",
  robots: { index: false, follow: false },
};

export default function JourneyPage() {
  return (
    <CommunityShell back>
      <JourneyView />
    </CommunityShell>
  );
}
