import { formatDate, sourceLabels } from "@/lib/format";
import { ArticleMatchList } from "./ArticleMatchCard";
import { ExtractionStatusLine, ExtractionStatusPill } from "./IssueExtractionStatus";
import { PageRail } from "./PageRail";
import type {
  ArticleComparisonSource,
  ArticleMatchGroup,
  ExtractionSummary,
  NewspaperIssue,
} from "./IssueComparisonTypes";

export function IssueComparisonBoard({
  peopleIssue,
  plaIssue,
  matchGroups,
  activePageNumber,
  visibleGroupCount,
  totalGroupCount,
}: {
  peopleIssue?: NewspaperIssue;
  plaIssue?: NewspaperIssue;
  matchGroups: ArticleMatchGroup[];
  activePageNumber?: number;
  visibleGroupCount?: number;
  totalGroupCount?: number;
}) {
  const issueDate = peopleIssue?.issueDate ?? plaIssue?.issueDate;
  const visibleCount = visibleGroupCount ?? matchGroups.length;
  const totalCount = totalGroupCount ?? matchGroups.length;

  return (
    <section className="overflow-hidden rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      <header className="border-b border-stone-200 bg-stone-100/70 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/80">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Issue comparison
            </p>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              {issueDate ? formatDate(issueDate) : "日付未確定"} 1-4面比較
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-300">
              MACHED / People&apos;s only / 81cn only の3分類で、対応関係と不確実性を確認します。
            </p>
          </div>
          <span className="rounded-sm border border-stone-200 bg-white/80 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200">
            {visibleCount} / {totalCount} groups
          </span>
        </div>
        <div className="mt-3 grid overflow-hidden rounded-sm border border-stone-200 bg-white md:grid-cols-2 md:divide-x md:divide-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:md:divide-stone-800">
          <IssueStatusCard source="people_daily" issue={peopleIssue} />
          <IssueStatusCard source="pla_daily" issue={plaIssue} />
        </div>
      </header>

      <IssueStateNotice peopleIssue={peopleIssue} plaIssue={plaIssue} />

      <div className="grid gap-4 bg-stone-50/60 p-4 dark:bg-stone-950">
        <ArticleMatchList groups={matchGroups} />
        <div className="grid gap-4 lg:grid-cols-2">
          <PageRail
            pages={peopleIssue?.pages ?? []}
            activePageNumber={activePageNumber}
            title="人民日報 1-4面"
            source="people_daily"
            issueDate={peopleIssue?.issueDate ?? issueDate}
            extraction={peopleIssue?.extraction}
            pdfUrl={peopleIssue?.pdfUrl}
            pageImageUrl={peopleIssue?.pageImageUrl}
          />
          <PageRail
            pages={plaIssue?.pages ?? []}
            activePageNumber={activePageNumber}
            title="解放軍報 1-4面"
            source="pla_daily"
            issueDate={plaIssue?.issueDate ?? issueDate}
            extraction={plaIssue?.extraction}
            pdfUrl={plaIssue?.pdfUrl}
            pageImageUrl={plaIssue?.pageImageUrl}
          />
        </div>
      </div>
    </section>
  );
}

function IssueStatusCard({
  source,
  issue,
}: {
  source: ArticleComparisonSource;
  issue?: NewspaperIssue;
}) {
  const articleCount = issue?.pages.reduce((total, page) => total + page.articles.length, 0) ?? 0;
  const fallbackStatus = issue ? (articleCount === 0 ? "empty" : undefined) : "failed";

  return (
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-stone-950 dark:text-stone-50">{sourceLabels[source]}</p>
        <ExtractionStatusPill extraction={issue?.extraction} fallbackStatus={fallbackStatus} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-stone-100 pt-2 text-[11px] text-stone-600 dark:border-stone-800 dark:text-stone-300">
        <StatusMeta label="pages" value={`${issue?.pages.length ?? 0}`} />
        <StatusMeta label="articles" value={`${articleCount}`} />
      </dl>
      <div className="mt-2">
        <ExtractionStatusLine
          extraction={issue?.extraction ?? missingIssueExtraction(source, issue)}
        />
      </div>
    </div>
  );
}

function IssueStateNotice({
  peopleIssue,
  plaIssue,
}: {
  peopleIssue?: NewspaperIssue;
  plaIssue?: NewspaperIssue;
}) {
  const peopleState = issueProblem(peopleIssue);
  const plaState = issueProblem(plaIssue);

  if (!peopleState && !plaState) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-semibold">取得・抽出状態に注意</p>
      <ul className="mt-1 space-y-1">
        {peopleState ? <li>人民日報: {peopleState}</li> : null}
        {plaState ? <li>解放軍報: {plaState}</li> : null}
      </ul>
    </div>
  );
}

function StatusMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-stone-400 dark:text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-stone-700 dark:text-stone-200">{value}</dd>
    </div>
  );
}

function issueProblem(issue?: NewspaperIssue) {
  if (!issue) {
    return "issue object が未取得です。片側だけの比較として表示しています。";
  }

  if (issue.extraction?.status === "failed") {
    return issue.extraction.message ?? "取得または抽出に失敗しました。";
  }

  const articleCount = issue.pages.reduce((total, page) => total + page.articles.length, 0);

  if (articleCount === 0) {
    return issue.extraction?.message ?? "1-4面に表示できる記事がありません。";
  }

  return null;
}

function missingIssueExtraction(
  source: ArticleComparisonSource,
  issue?: NewspaperIssue,
): ExtractionSummary | undefined {
  if (issue) {
    return undefined;
  }

  return {
    status: "failed",
    message: `${sourceLabels[source]}のissue objectが渡されていません。`,
  };
}
