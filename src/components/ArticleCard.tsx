import { formatDate } from "@/lib/format";
import type { ReactNode } from "react";
import type { Article } from "@/types";
import { ActorChips, KeywordChips, PageProminenceIndicator, SourceBadge } from "./VisualBits";

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="relative rounded-md border border-stone-200 bg-white p-4 pr-14 shadow-sm dark:border-stone-800 dark:bg-stone-950">
      <a
        href={article.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${article.title} の出典を開く`}
        title="出典を開く"
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:bg-white dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-500"
      >
        ↗
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SourceBadge source={article.source} />
        <PageProminenceIndicator pageNumber={article.pageNumber} />
      </div>

      <div className="mt-3 space-y-2">
        <h3 className="text-base font-semibold leading-snug text-stone-950 dark:text-stone-50">{article.title}</h3>
        {article.subtitle ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">{article.subtitle}</p>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-300">
          <MetaItem label="発行日" value={formatDate(article.issueDate)} />
          <MetaItem label="版面" value={`${article.pageNumber}版 ${article.pageName}`} />
          {article.columnName ? <MetaItem label="欄名" value={article.columnName} /> : null}
          {article.author ? <MetaItem label="署名" value={article.author} /> : null}
        </dl>
      </div>

      <div className="mt-4 space-y-2">
        <SectionLabel>短い抜粋</SectionLabel>
        <p className="border-l-2 border-stone-200 pl-3 text-sm leading-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {article.excerpt}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <SectionLabel>抽出キーワード</SectionLabel>
        <KeywordChips
          terms={article.keywords}
          variant={article.source === "people_daily" ? "people" : "pla"}
        />
      </div>

      <div className="mt-4 space-y-3 rounded-md bg-stone-50 p-3 dark:bg-stone-900/70">
        <SectionLabel>ナラティブ・プロフィール</SectionLabel>
        <p className="text-sm leading-6 text-stone-700 dark:text-stone-300">{article.narrativeProfile.coreFrame}</p>
        <ActorChips actors={article.narrativeProfile.mainActors} />
      </div>
    </article>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-stone-400 dark:text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-stone-700 dark:text-stone-200">{value}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{children}</p>;
}
