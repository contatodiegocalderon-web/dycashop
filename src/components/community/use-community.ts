"use client";

import { useCallback, useEffect, useState } from "react";
import { DROP_LOGIN_PATH } from "@/lib/dropshipping";
import type { LessonModule } from "@/lib/drop-community";

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
  lessons: Lesson[];
  completedLessonIds: string[];
  schedule: {
    weekStart: string;
    today: number;
    items: ScheduleItem[];
    checkedItemIds: string[];
  };
};

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
    async (kind: "lesson" | "schedule", id: string, done: boolean) => {
      const key = kind === "lesson" ? "completedLessonIds" : "checkedItemIds";
      const apply = (on: boolean) =>
        setData((d) => {
          if (!d) return d;
          const list = kind === "lesson" ? d.completedLessonIds : d.schedule.checkedItemIds;
          const next = on ? Array.from(new Set([...list, id])) : list.filter((x) => x !== id);
          return kind === "lesson"
            ? { ...d, [key]: next }
            : { ...d, schedule: { ...d.schedule, [key]: next } };
        });
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

  return { data, error, toggle };
}
