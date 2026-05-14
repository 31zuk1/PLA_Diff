import Link from "next/link";
import { formatDateRange, matchTypeLabels } from "@/lib/format";
import type { Article, TopicCluster } from "@/types";
import { ConfidenceBadge, KeywordChips } from "./VisualBits";

export function TopicClusterCard({
  topic,
  peopleKeywords,
  plaKeywords,
  peopleArticles,
  plaArticles,
}: {
  topic: TopicCluster;
  peopleKeywords: string[];
  plaKeywords: string[];
  peopleArticles: Article[];
  plaArticles: Article[];
}) {
  return (
    <article className="group rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            {formatDateRange(topic.dateRange.start, topic.dateRange.end)}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-stone-950">{topic.topicLabel}</h2>
        </div>
        <ConfidenceBadge confidence={topic.confidence} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">
          {matchTypeLabels[topic.matchType]}
        </span>
        <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">
          人民 {peopleArticles.length}件
        </span>
        <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          軍報 {plaArticles.length}件
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-stone-600">{topic.summary}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FrameSummary label="人民日報フレーム" terms={peopleKeywords} variant="people" />
        <FrameSummary label="解放軍報フレーム" terms={plaKeywords} variant="pla" />
      </div>

      <Link
        href={`/topics/${topic.id}`}
        className="mt-5 inline-flex items-center text-sm font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 group-hover:decoration-stone-950"
      >
        詳細比較を開く
      </Link>
    </article>
  );
}

function FrameSummary({
  label,
  terms,
  variant,
}: {
  label: string;
  terms: string[];
  variant: "people" | "pla";
}) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
      <p className="mb-2 text-xs font-semibold text-stone-500">{label}</p>
      <KeywordChips terms={terms} variant={variant} limit={6} />
    </div>
  );
}
