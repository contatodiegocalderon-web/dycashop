import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveDropMember } from "@/lib/drop-member-access";
import { addDays, currentWeekStart, saoPauloToday } from "@/lib/drop-community";
import { planStreak } from "@/lib/drop-content-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const weekStart = currentWeekStart();
  const today = saoPauloToday();
  const admin = createAdminClient();
  const [lessons, progress, items, planChecks, formats] = await Promise.all([
    admin
      .from("drop_lessons")
      .select("id, module, title, description, youtube_url, position")
      .eq("published", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("drop_lesson_progress")
      .select("lesson_id")
      .eq("member_id", member.memberId),
    admin
      .from("drop_schedule_items")
      .select("id, weekday, title, description, link_url, position")
      .eq("week_start", weekStart)
      .order("weekday", { ascending: true })
      .order("position", { ascending: true }),
    admin
      .from("drop_plan_checks")
      .select("day, slot")
      .eq("member_id", member.memberId)
      .gte("day", addDays(today.date, -120))
      .order("day", { ascending: false }),
    admin.from("drop_content_formats").select("format_key, material_url, lesson_id"),
  ]);

  const err = lessons.error ?? progress.error ?? items.error ?? planChecks.error ?? formats.error;
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const itemIds = (items.data ?? []).map((i) => i.id as string);
  const checks = itemIds.length
    ? await admin
        .from("drop_schedule_checks")
        .select("item_id")
        .eq("member_id", member.memberId)
        .in("item_id", itemIds)
    : { data: [], error: null };
  if (checks.error) {
    return NextResponse.json({ error: checks.error.message }, { status: 500 });
  }

  return NextResponse.json({
    user: { email: member.email, fullName: member.fullName },
    lessons: lessons.data ?? [],
    completedLessonIds: (progress.data ?? []).map((p) => p.lesson_id),
    schedule: {
      weekStart,
      today: today.weekday,
      items: items.data ?? [],
      checkedItemIds: (checks.data ?? []).map((c) => c.item_id),
    },
    plan: {
      today: today.date,
      checks: (planChecks.data ?? [])
        .filter((c) => c.day >= weekStart)
        .map((c) => `${c.day}|${c.slot}`),
      streakBeforeToday: planStreak(
        (planChecks.data ?? []).filter((c) => c.day < today.date),
        addDays(today.date, -1)
      ),
      formats: formats.data ?? [],
    },
  });
}
