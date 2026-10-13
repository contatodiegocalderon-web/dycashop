"use client";

import { useCallback, useEffect, useState } from "react";
import { DROP_LOGIN_PATH } from "@/lib/dropshipping";
import type { LessonModule } from "@/lib/drop-community";
import { buildDayPlan, isDayComplete, type PlanSlotId } from "@/lib/drop-content-plan";

export type Lesson = {
  id: string;
  module: LessonModule;
  title: string;
  description: string | null;
  youtube_url: string | null;
  position: number;
};

export type ScheduleItem = {
  id: string;
  weekday: number;
  title: string;
  description: string | null;
  link_url: string | null;
  position: number;
};

export type CommunityData = {
  user: { email: string; fullName: string | null };
  /** Já fechou o vídeo de boas-vindas da primeira entrada. */
  welcomeSeen: boolean;
  lessons: Lesson[];
  completedLessonIds: string[];
  schedule: {
    weekStart: string;
    today: number;
    items: ScheduleItem[];
    checkedItemIds: string[];
  };
  plan: {
    today: string;
    /** `AAAA-MM-DD|slot` da semana atual. */
    checks: string[];
    streakBeforeToday: number;
    formats: { format_key: string; material_url: string | null; lesson_id: string | null }[];
  };
};

export type ToggleKind = "lesson" | "schedule" | "plan";

function withList(d: CommunityData, kind: ToggleKind, fn: (list: string[]) => string[]): CommunityData {
  if (kind === "lesson") return { ...d, completedLessonIds: fn(d.completedLessonIds) };
  if (kind === "schedule") return { ...d, schedule: { ...d.schedule, checkedItemIds: fn(d.schedule.checkedItemIds) } };
  return { ...d, plan: { ...d.plan, checks: fn(d.plan.checks) } };
}

export function planDayProgress(data: CommunityData, date: string) {
  const plan = buildDayPlan(date);
  const isChecked = (slot: PlanSlotId) => data.plan.checks.includes(`${date}|${slot}`);
  return {
    plan,
    isChecked,
    done: plan.slots.filter((s) => isChecked(s.id)).length,
    total: plan.slots.length,
    complete: isDayComplete(isChecked),
  };
}

export function currentStreak(data: CommunityData): number {
  return data.plan.streakBeforeToday + (planDayProgress(data, data.plan.today).complete ? 1 : 0);
}

export function useCommunity() {
  const [data, setData] = useState<CommunityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/drop/community", { credentials: "include" });
      if (res.status === 401) {
        window.location.replace(DROP_LOGIN_PATH);
        return;
      }
      const json = (await res.json()) as CommunityData & { error?: string };
      if (!alive) return;
      if (!res.ok) setError(json.error ?? "Falha ao carregar a comunidade");
      else setData(json);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(
    async (kind: ToggleKind, id: string, done: boolean) => {
      const apply = (on: boolean) =>
        setData((d) =>
          d
            ? withList(d, kind, (list) =>
                on ? Array.from(new Set([...list, id])) : list.filter((x) => x !== id)
              )
            : d
        );
      apply(done);
      const res = await fetch("/api/drop/progress", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, done }),
      });
      if (!res.ok) apply(!done);
    },
    []
  );

  const dismissWelcome = useCallback(async () => {
    setData((d) => (d ? { ...d, welcomeSeen: true } : d));
    await fetch("/api/drop/welcome", { method: "POST", credentials: "include" });
  }, []);

  return { data, error, toggle, dismissWelcome };
}
