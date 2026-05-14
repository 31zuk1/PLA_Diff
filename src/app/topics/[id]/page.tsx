import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { FrameComparison } from "@/components/FrameComparison";
import { TopicDeltaOverview } from "@/components/TopicDeltaOverview";
import { topicClusters } from "@/data/mockData";
import { formatDateRange, matchTypeLabels } from "@/lib/format";
import { getArticlesForTopic, getTopicById } from "@/lib/data";
import { ConfidenceBadge } from "@/components/VisualBits";

type TopicPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return topicClusters.map((topic) => ({
    id: topic.id,
  }));
}

export async function generateMetadata({ params }: TopicPageProps) {
  const { id } = await params;
  const topic = getTopicById(id);

  return {
    title: topic ? `${topic.topicLabel} | PeoplePLA Diff` : "Topic not found | PeoplePLA Diff",
  };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { id } = await params;
  const topic = getTopicById(id);

  if (!topic) {
    notFound();
  }

  const { people, pla } = getArticlesForTopic(topic);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="inline-flex text-sm font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 hover:decoration-stone-950"
        >
          ダッシュボードへ戻る
        </Link>

        <header className="mt-5 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
                Topic comparison
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-stone-950 sm:text-4xl">
                {topic.topicLabel}
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{topic.summary}</p>
            </div>
            <ConfidenceBadge confidence={topic.confidence} />
          </div>

          <dl className="mt-5 grid gap-3 border-t border-stone-100 pt-5 sm:grid-cols-4">
            <HeaderMeta
              label="期間"
              value={formatDateRange(topic.dateRange.start, topic.dateRange.end)}
            />
            <HeaderMeta label="マッチ種別" value={matchTypeLabels[topic.matchType]} />
            <HeaderMeta label="人民日報" value={`${people.length}件`} />
            <HeaderMeta label="解放軍報" value={`${pla.length}件`} />
          </dl>
        </header>

        <TopicDeltaOverview
          topic={topic}
          peopleArticleCount={people.length}
          plaArticleCount={pla.length}
        />

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)_minmax(0,1fr)]">
          <ArticleColumn title="人民日報記事" count={people.length}>
            {people.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </ArticleColumn>

          <FrameComparison peopleArticles={people} plaArticles={pla} />

          <ArticleColumn title="解放軍報記事" count={pla.length}>
            {pla.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </ArticleColumn>
        </section>

        <div className="mt-6">
          <AnalysisPanel topic={topic} />
        </div>
      </div>
    </main>
  );
}

function HeaderMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-stone-900">{value}</dd>
    </div>
  );
}

function ArticleColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
        <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600">
          {count}件
        </span>
      </div>
      {count > 0 ? (
        <div className="grid gap-4">{children}</div>
      ) : (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/70 p-5 text-sm text-stone-500">
          この側に紐づく記事メタデータはまだありません。
        </div>
      )}
    </section>
  );
}
