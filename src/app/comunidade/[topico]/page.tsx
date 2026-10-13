import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { DROP_CATALOG_DRIVE_URL } from "@/lib/dropshipping";
import { getTopic } from "@/lib/drop-community";
import { TopicView } from "@/components/community/topic-view";

export function generateMetadata({ params }: { params: { topico: string } }): Metadata {
  const topic = getTopic(params.topico);
  return { title: topic ? `${topic.title} · comunidade DYCASHOP` : "Comunidade DYCASHOP" };
}

export default function TopicPage({ params }: { params: { topico: string } }) {
  const topic = getTopic(params.topico);
  if (!topic) notFound();
  if (topic.kind === "link" || topic.kind === "external") {
    redirect(topic.href ?? DROP_CATALOG_DRIVE_URL);
  }
  return (
    <Suspense>
      <TopicView topic={topic} />
    </Suspense>
  );
}
