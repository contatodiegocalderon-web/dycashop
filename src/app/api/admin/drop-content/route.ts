import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnerAccess } from "@/lib/admin-auth";
import {
  addDays,
  currentWeekStart,
  isIsoDate,
  isLessonModule,
} from "@/lib/drop-community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(request: NextRequest): Promise<NextResponse | null> {
  try {
    await assertOwnerAccess(request);
    return null;
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }
}

function text(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function mondayOf(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!isIsoDate(s)) return null;
  const day = new Date(`${s}T12:00:00Z`).getUTCDay();
  return addDays(s, day === 0 ? -6 : 1 - day);
}

export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const week = mondayOf(request.nextUrl.searchParams.get("week")) ?? currentWeekStart();
  const admin = createAdminClient();
  const [lessons, items] = await Promise.all([
    admin
      .from("drop_lessons")
      .select("id, module, title, description, youtube_url, position, published")
      .order("module")
      .order("position")
      .order("created_at"),
    admin
      .from("drop_schedule_items")
      .select("id, weekday, title, description, link_url, position")
      .eq("week_start", week)
      .order("weekday")
      .order("position"),
  ]);
  const err = lessons.error ?? items.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({
    week,
    lessons: lessons.data ?? [],
    items: items.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const admin = createAdminClient();

  if (body.type === "lesson") {
    const mod = String(body.module ?? "");
    const title = text(body.title);
    if (!isLessonModule(mod) || !title) {
      return NextResponse.json({ error: "Escolha o tópico e o título" }, { status: 400 });
    }
    const { count } = await admin
      .from("drop_lessons")
      .select("id", { count: "exact", head: true })
      .eq("module", mod);
    const { error } = await admin.from("drop_lessons").insert({
      module: mod,
      title,
      description: text(body.description),
      youtube_url: text(body.youtube_url),
      published: body.published !== false,
      position: count ?? 0,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "schedule") {
    const week = mondayOf(body.week_start);
    const weekday = Number(body.weekday);
    const title = text(body.title);
    if (!week || !(weekday >= 1 && weekday <= 7) || !title) {
      return NextResponse.json({ error: "Informe semana, dia e título" }, { status: 400 });
    }
    const { count } = await admin
      .from("drop_schedule_items")
      .select("id", { count: "exact", head: true })
      .eq("week_start", week)
      .eq("weekday", weekday);
    const { error } = await admin.from("drop_schedule_items").insert({
      week_start: week,
      weekday,
      title,
      description: text(body.description),
      link_url: text(body.link_url),
      position: count ?? 0,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "copy-week") {
    const from = mondayOf(body.from);
    const to = mondayOf(body.to);
    if (!from || !to || from === to) {
      return NextResponse.json({ error: "Semanas inválidas" }, { status: 400 });
    }
    const { data: src, error: sErr } = await admin
      .from("drop_schedule_items")
      .select("weekday, title, description, link_url, position")
      .eq("week_start", from);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!src?.length) {
      return NextResponse.json({ error: "A semana anterior está vazia" }, { status: 400 });
    }
    const { error } = await admin
      .from("drop_schedule_items")
      .insert(src.map((r) => ({ ...r, week_start: to })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, copied: src.length });
  }

  return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const admin = createAdminClient();

  if (body.type === "lesson") {
    const patch: Record<string, unknown> = {};
    if ("title" in body) {
      const t = text(body.title);
      if (!t) return NextResponse.json({ error: "Título vazio" }, { status: 400 });
      patch.title = t;
    }
    if ("description" in body) patch.description = text(body.description);
    if ("youtube_url" in body) patch.youtube_url = text(body.youtube_url);
    if ("published" in body) patch.published = body.published === true;
    if ("position" in body && Number.isFinite(Number(body.position))) {
      patch.position = Number(body.position);
    }
    if ("module" in body) {
      const mod = String(body.module);
      if (!isLessonModule(mod)) {
        return NextResponse.json({ error: "Tópico inválido" }, { status: 400 });
      }
      patch.module = mod;
    }
    const { error } = await admin.from("drop_lessons").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "schedule") {
    const patch: Record<string, unknown> = {};
    if ("title" in body) {
      const t = text(body.title);
      if (!t) return NextResponse.json({ error: "Título vazio" }, { status: 400 });
      patch.title = t;
    }
    if ("description" in body) patch.description = text(body.description);
    if ("link_url" in body) patch.link_url = text(body.link_url);
    const { error } = await admin.from("drop_schedule_items").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const type = request.nextUrl.searchParams.get("type");
  const id = text(request.nextUrl.searchParams.get("id"));
  if (!id || (type !== "lesson" && type !== "schedule")) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const table = type === "lesson" ? "drop_lessons" : "drop_schedule_items";
  const { error } = await createAdminClient().from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
