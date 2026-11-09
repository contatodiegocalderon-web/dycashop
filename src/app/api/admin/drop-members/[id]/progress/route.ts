import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";
import { REWARD_KIND_LABELS, computeRewards } from "@/lib/drop-rewards";
import { loadMemberJourney } from "@/lib/drop-journey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status });
  }

  const admin = createAdminClient();
  try {
    const [journey, lessons, watched] = await Promise.all([
      loadMemberJourney(admin, params.id),
      admin.from("drop_lessons").select("id", { count: "exact", head: true }).eq("published", true),
      admin.from("drop_lesson_progress").select("lesson_id").eq("member_id", params.id),
    ]);
    if (lessons.error) throw new Error(lessons.error.message);
    if (watched.error) throw new Error(watched.error.message);

    const rewards = computeRewards(journey.pieces, journey.spent, journey.claims);
    return NextResponse.json({
      pieces: journey.pieces,
      spent: journey.spent,
      todayPieces: journey.todayPieces,
      todaySpent: journey.todaySpent,
      hasPhone: journey.hasPhone,
      subscribedAt: journey.subscribedAt,
      hasSubscription: journey.hasSubscription,
      rank: rewards.rank,
      unitPrice: rewards.unitPrice,
      cycle: rewards.cycle,
      freeEvery: 10,
      freeAvailable: rewards.freeAvailable,
      videosAvailable: rewards.videosAvailable,
      hasSupport: rewards.hasSupport,
      next: rewards.next ? { at: rewards.next.at, title: rewards.next.title } : null,
      lessonsDone: watched.data?.length ?? 0,
      lessonsTotal: lessons.count ?? 0,
      claims: journey.claims.slice(0, 8).map((c) => ({
        id: c.id,
        kind: REWARD_KIND_LABELS[c.kind],
        status: c.status,
        createdAt: c.created_at,
      })),
      orders: journey.orders.slice(0, 6).map((o) => ({
        id: o.id,
        number: o.number,
        pieces: o.pieces,
        amount: o.amount,
        confirmedAt: o.confirmedAt,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
