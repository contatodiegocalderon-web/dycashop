import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveDropMember } from "@/lib/drop-member-access";

export const runtime = "nodejs";

/** Marca/desmarca aula assistida (`kind: "lesson"`) ou item do cronograma (`kind: "schedule"`). */
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
  if (!id || (body.kind !== "lesson" && body.kind !== "schedule")) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const admin = createAdminClient();
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
