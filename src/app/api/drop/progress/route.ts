import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveDropMember } from "@/lib/drop-member-access";
import { addDays, isIsoDate, saoPauloToday } from "@/lib/drop-community";
import { buildDayPlan, isPlanSlotId } from "@/lib/drop-content-plan";

export const runtime = "nodejs";

/**
 * Marca/desmarca aula assistida (`kind: "lesson"`), item extra do cronograma (`kind: "schedule"`)
 * ou post do cronograma automático (`kind: "plan"`, `id: "AAAA-MM-DD|slot"`).
 */
export async function POST(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { kind?: string; id?: string; done?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const admin = createAdminClient();

  if (body.kind === "plan") {
    const [day = "", slot = ""] = id.split("|");
    const today = saoPauloToday().date;
    if (
      !isIsoDate(day) ||
      day > today ||
      day < addDays(today, -13) ||
      !isPlanSlotId(slot) ||
      !buildDayPlan(day).slots.some((s) => s.id === slot)
    ) {
      return NextResponse.json({ error: "Post inválido" }, { status: 400 });
    }
    const { error } = body.done
      ? await admin
          .from("drop_plan_checks")
          .upsert({ member_id: member.memberId, day, slot }, { onConflict: "member_id,day,slot" })
      : await admin
          .from("drop_plan_checks")
          .delete()
          .eq("member_id", member.memberId)
          .eq("day", day)
          .eq("slot", slot);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!id || (body.kind !== "lesson" && body.kind !== "schedule")) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const table = body.kind === "lesson" ? "drop_lesson_progress" : "drop_schedule_checks";
  const col = body.kind === "lesson" ? "lesson_id" : "item_id";

  const { error } = body.done
    ? await admin
        .from(table)
        .upsert({ member_id: member.memberId, [col]: id }, { onConflict: `member_id,${col}` })
    : await admin.from(table).delete().eq("member_id", member.memberId).eq(col, id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
