import { formatConfidence, formatDate, sourceLabels } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ExtractionStatusPill } from "./IssueExtractionStatus";
import type {
  ArticleComparisonSource,
  ArticleMatchGroup,
  IssueComparisonMatchType,
  ScrapedArticle,
} from "./IssueComparisonTypes";

const issueMatchTypeLabels: Record<IssueComparisonMatchType, string> = {
  matched: "MACHED",
  people_only: "People's only",
  pla_only: "81cn only",
};

export function ArticleMatchCard({ group }: { group: ArticleMatchGroup }) {
  const isUnmatched = group.matchType !== "matched";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-md border bg-white shadow-sm dark:bg-stone-950",
        isUnmatched ? "border-amber-300 dark:border-amber-700/70" : "border-stone-200 dark:border-stone-800",
      )}
    >
      <MatchHeader group={group} />

      <div className="grid bg-white dark:bg-stone-950 xl:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)]">
        <ArticleStack
          source="people_daily"
          articles={group.peopleArticles}
          isUnmatched={isUnmatched}
        />
        <MatchMetadata group={group} />
        <ArticleStack source="pla_daily" articles={group.plaArticles} isUnmatched={isUnmatched} />
      </div>

      <div className="grid border-t border-stone-200 bg-stone-50/70 md:grid-cols-[1fr_1fr] md:divide-x md:divide-stone-200 dark:border-stone-800 dark:bg-stone-900/60 dark:md:divide-stone-800">
        <LexicalContrast group={group} />
        <UncertaintyNotes notes={group.uncertaintyNotes} />
      </div>
    </article>
  );
}

export function ArticleMatchList({ groups }: { groups: ArticleMatchGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 bg-white/70 px-4 py-6 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-950/70 dark:text-stone-400">
        この日付範囲では比較カードがまだありません。
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <ArticleMatchCard key={group.id} group={group} />
      ))}
    </div>
  );
}

function MatchHeader({
  group,
}: {
  group: ArticleMatchGroup;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-100/70 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/80">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Article relation / {formatDate(group.issueDate)}
        </span>
        <h3 className="text-sm font-semibold text-stone-950 dark:text-stone-50">{issueMatchTypeLabels[group.matchType]}</h3>
        <ExtractionStatusPill extraction={group.extraction} />
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border bg-white/80 px-2 py-0.5 text-[11px] font-semibold dark:bg-stone-950",
          group.confidence >= 0.85 && "border-emerald-500 text-emerald-800 dark:text-emerald-300",
          group.confidence >= 0.7 &&
            group.confidence < 0.85 &&
            "border-amber-500 text-amber-800 dark:text-amber-300",
          group.confidence < 0.7 && "border-stone-400 text-stone-700 dark:text-stone-300",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        confidence {formatConfidence(group.confidence)}
      </span>
    </div>
  );
}

function MatchMetadata({ group }: { group: ArticleMatchGroup }) {
  return (
    <aside className="border-y border-stone-200 bg-stone-50/80 px-3 py-3 dark:border-stone-800 dark:bg-stone-900/70 xl:border-x xl:border-y-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Match metadata
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-stone-200 py-2 dark:border-stone-800 xl:grid-cols-1">
        <MetadataItem label="label" value={issueMatchTypeLabels[group.matchType]} />
        <MetadataItem label="confidence" value={formatConfidence(group.confidence)} />
        <MetadataItem
          label="関係"
          value={`${group.peopleArticles.length} : ${group.plaArticles.length}`}
        />
        {group.extraction?.method ? (
          <MetadataItem label="extraction" value={group.extraction.method} />
        ) : null}
      </dl>
      <div className="mt-3">
        <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">理由</p>
        <p className="mt-1 text-xs leading-5 text-stone-700 dark:text-stone-300">{group.reason}</p>
      </div>
    </aside>
  );
}

function ArticleStack({
  source,
  articles,
  isUnmatched,
}: {
  source: ArticleComparisonSource;
  articles: ScrapedArticle[];
  isUnmatched: boolean;
}) {
  return (
    <section>
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-stone-200 px-3 py-2 dark:border-stone-800",
          source === "people_daily" ? "bg-rose-50/60 dark:bg-rose-950/20" : "bg-teal-50/60 dark:bg-teal-950/20",
        )}
      >
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-800 dark:text-stone-200">
          {sourceLabels[source]}
        </h4>
        <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
          {articles.length}本
        </span>
      </div>

      {articles.length > 0 ? (
        <div className="divide-y divide-stone-200 dark:divide-stone-800">
          {articles.map((article) => (
            <ArticleSummary key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "min-h-32 border-l-2 bg-white px-3 py-5 text-sm leading-6 dark:bg-stone-950",
            isUnmatched ? "border-amber-400 text-amber-800 dark:text-amber-300" : "border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400",
          )}
        >
          {isUnmatched ? "片側記事のみ。対応する記事は未検出です。" : "対応候補なし"}
        </div>
      )}
    </section>
  );
}

function ArticleSummary({ article }: { article: ScrapedArticle }) {
  return (
    <div className="relative bg-white px-3 py-3 pr-12 dark:bg-stone-950">
      {article.url ? (
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
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
        <span className="font-semibold text-stone-700 dark:text-stone-200">{article.pageNumber}面</span>
        {article.pageName ? <span>{article.pageName}</span> : null}
        {article.author ? <span>署名: {article.author}</span> : null}
        <ExtractionStatusPill extraction={article.extraction} />
      </div>
      <h5 className="mt-1.5 text-sm font-semibold leading-snug text-stone-950 dark:text-stone-50">{article.title}</h5>
      {article.subtitle ? <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">{article.subtitle}</p> : null}
      <p className="mt-2 border-l-2 border-stone-200 pl-2 text-xs leading-5 text-stone-700 dark:border-stone-700 dark:text-stone-300">
        {article.excerpt}
      </p>
      {article.keywords && article.keywords.length > 0 ? (
        <TermRow terms={article.keywords.slice(0, 5)} tone={article.source} />
      ) : null}
    </div>
  );
}

function LexicalContrast({ group }: { group: ArticleMatchGroup }) {
  const lexicalContrast = group.lexicalContrast;

  if (!lexicalContrast) {
    return (
      <ComparisonPanel title="差分語彙">
        <p className="text-sm text-stone-500 dark:text-stone-400">語彙差分は未抽出です。</p>
      </ComparisonPanel>
    );
  }

  return (
    <ComparisonPanel title="差分語彙">
      <div className="space-y-3">
        <TermGroup
          label="人民日報で目立つ語"
          terms={lexicalContrast.peopleDailyTerms}
          tone="people_daily"
        />
        <TermGroup label="解放軍報で目立つ語" terms={lexicalContrast.plaDailyTerms} tone="pla_daily" />
        {lexicalContrast.sharedTerms && lexicalContrast.sharedTerms.length > 0 ? (
          <TermGroup label="共有語彙" terms={lexicalContrast.sharedTerms} tone="neutral" />
        ) : null}
      </div>
    </ComparisonPanel>
  );
}

function UncertaintyNotes({ notes }: { notes?: string[] }) {
  return (
    <ComparisonPanel title="不確実性">
      {notes && notes.length > 0 ? (
        <ul className="space-y-1.5 text-xs leading-5 text-stone-700 dark:text-stone-300">
          {notes.map((note) => (
            <li key={note} className="border-l-2 border-amber-200 pl-3 dark:border-amber-700/70">
              {note}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">
          追加の不確実性メモはありません。スローガン一致のみではなく、記事配置と抜粋理由も確認してください。
        </p>
      )}
    </ComparisonPanel>
  );
}

function ComparisonPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TermGroup({
  label,
  terms,
  tone,
}: {
  label: string;
  terms: string[];
  tone: ArticleComparisonSource | "neutral";
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <TermRow terms={terms} tone={tone} />
    </div>
  );
}

function TermRow({
  terms,
  tone,
}: {
  terms: string[];
  tone: ArticleComparisonSource | "neutral";
}) {
  if (terms.length === 0) {
    return <p className="text-xs text-stone-500 dark:text-stone-400">なし</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {terms.map((term) => (
        <span
          key={term}
          className={cn(
            "border px-1.5 py-0.5 text-[11px] leading-none",
            tone === "people_daily" && "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
            tone === "pla_daily" && "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
            tone === "neutral" && "border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
          )}
        >
          {term}
        </span>
      ))}
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-xs font-semibold text-stone-900 dark:text-stone-100">{value}</dd>
    </div>
  );
}
