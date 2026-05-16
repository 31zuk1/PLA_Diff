import { IssueComparisonBoard } from "@/components/IssueComparisonBoard";
import { IssueGraphView, type IssueGraphDateMetric } from "@/components/IssueGraphView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { canUseLlmJudge } from "@/lib/llmMatching";
import type { DailyIssueSnapshot, SnapshotCounts, SnapshotIndexEntry } from "@/lib/dailySnapshot";
import { buildIssueGraph } from "@/lib/issueGraph";
import {
  issueDateInChinaTime,
  normalizeIssueDate,
  snapshotRetentionLabel,
} from "@/lib/snapshotConfig";
import { readDailyIssueSnapshot, readSnapshotIndex, storageDriverLabel } from "@/lib/snapshotStorage";
import type { ArticleMatchGroup } from "@/components/IssueComparisonTypes";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{
    date?: string;
    view?: string;
    sort?: string;
  }>;
};

type ViewFilter = "all" | "matched" | "only";
type SortMode = "relevance" | "page";

export default async function Home({ searchParams }: HomeProps) {
  const params = searchParams ? await searchParams : {};
  const snapshotIndex = await readSnapshotIndex();
  const latestIssueDate = snapshotIndex.entries[0]?.issueDate ?? issueDateInChinaTime();
  const issueDate = normalizeIssueDate(params.date) ?? latestIssueDate;
  const viewFilter = normalizeViewFilter(params.view);
  const sortMode = normalizeSortMode(params.sort);
  const snapshot = await readDailyIssueSnapshot(issueDate);
  const allDisplayGroups = snapshot?.matchGroups ?? [];
  const displayGroups = sortGroups(filterGroups(allDisplayGroups, viewFilter), sortMode);
  const counts = snapshot?.counts ?? emptyCounts();
  const issueGraph = snapshot ? buildIssueGraph(snapshot) : undefined;
  const availableGraphDates = snapshotIndex.entries.map((entry) => entry.issueDate);
  const graphDateMetrics = await buildGraphDateMetrics(
    snapshotIndex.entries,
    issueDate,
    snapshot,
  );

  return (
    <main className="min-h-screen px-4 py-6 transition-colors dark:bg-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1760px]">
        <header className="grid gap-5 border-b border-stone-200 pb-5 dark:border-stone-800 xl:grid-cols-[minmax(0,1fr)_minmax(520px,600px)] xl:items-end">
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-50 sm:text-4xl">
                People&apos;s/81cn Diff
              </h1>
              <ThemeToggle />
            </div>
            <p className="mt-3 max-w-none text-pretty text-sm leading-6 text-stone-600 dark:text-stone-300">
              人民日報の紙面HTMLと解放軍報の紙面JSONから毎日生成した1〜4面比較の保存済みsnapshotを表示します。全文ミラーではなく、短い抜粋・版面情報・マッチ理由・不確実性を研究用に並べます。
            </p>
          </div>

          <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
            <form action="/" className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Issue date" htmlFor="date">
                  <select
                    id="date"
                    name="date"
                    defaultValue={issueDate}
                    className="h-11 w-full rounded-sm border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition focus:border-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-teal-400"
                  >
                    {snapshotIndex.entries.some((entry) => entry.issueDate === issueDate) ? null : (
                      <option value={issueDate}>{formatIssueDate(issueDate)} / snapshotなし</option>
                    )}
                    {snapshotIndex.entries.map((entry) => (
                      <option key={entry.issueDate} value={entry.issueDate}>
                        {formatIssueDate(entry.issueDate)} / P {entry.peopleArticles} / 81cn {entry.plaArticles}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Filter" htmlFor="view">
                  <select
                    id="view"
                    name="view"
                    defaultValue={viewFilter}
                    className="h-11 w-full rounded-sm border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition focus:border-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-teal-400"
                  >
                    <option value="all">All</option>
                    <option value="matched">MACHED only</option>
                    <option value="only">Only groups</option>
                  </select>
                </Field>
                <Field label="Sort" htmlFor="sort">
                  <select
                    id="sort"
                    name="sort"
                    defaultValue={sortMode}
                    className="h-11 w-full rounded-sm border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition focus:border-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-teal-400"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="page">Page order</option>
                  </select>
                </Field>
              </div>
              <button
                type="submit"
                className="h-11 rounded-sm bg-stone-950 px-3 text-sm font-semibold text-white transition hover:bg-stone-800 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
              >
                保存済み比較を表示
              </button>
              <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">
                {snapshot ? (
                  <>
                    最終更新: {formatTimestamp(snapshot.generatedAt)} / LLM判定:{" "}
                    {snapshot.judge.enabled ? snapshot.judge.model : "無効"} / 保存先:{" "}
                    {storageDriverLabel()}
                  </>
                ) : (
                  <>
                    {issueDate} のsnapshotは未作成です。Cron更新後に表示できます。保存先:{" "}
                    {storageDriverLabel()}
                  </>
                )}
              </p>
            </form>
          </section>
        </header>

        <section className="mt-4 grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 text-sm leading-6 text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-800 dark:text-stone-300 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="人民日報 articles" value={`${counts.peopleArticles}本`} />
          <StatCard label="解放軍報 articles" value={`${counts.plaArticles}本`} />
          <StatCard
            label="MACHED"
            value={`${counts.matchedGroups}件`}
            detail={`People ${counts.matchedPeopleArticles}本 / 81cn ${counts.matchedPlaArticles}本`}
          />
          <StatCard label="People's only" value={`${counts.peopleOnlyArticles}本`} />
          <StatCard label="81cn only" value={`${counts.plaOnlyArticles}本`} />
        </section>

        <SnapshotArchiveNotice
          entries={snapshotIndex.entries}
          selectedIssueDate={issueDate}
          snapshotExists={Boolean(snapshot)}
        />

        {issueGraph ? (
          <div className="mt-4" id="graph">
            <IssueGraphView
              graph={issueGraph}
              issueDate={issueDate}
              selectedDate={issueDate}
              availableDates={availableGraphDates}
              dateMetrics={graphDateMetrics}
              viewFilter={viewFilter}
              sortMode={sortMode}
              title="Article graph"
            />
          </div>
        ) : null}

        <div className="mt-4">
          <IssueComparisonBoard
            peopleIssue={snapshot?.peopleIssue}
            plaIssue={snapshot?.plaIssue}
            matchGroups={displayGroups}
            visibleGroupCount={displayGroups.length}
            totalGroupCount={allDisplayGroups.length}
          />
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3 dark:bg-stone-950">
      <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-tight text-stone-950 dark:text-stone-50">{value}</p>
      {detail ? (
        <p className="mt-1 text-xs font-semibold leading-5 text-stone-500 dark:text-stone-400">{detail}</p>
      ) : null}
    </div>
  );
}

function normalizeViewFilter(value: string | undefined): ViewFilter {
  if (value === "matched" || value === "only") {
    return value;
  }

  return "all";
}

function normalizeSortMode(value: string | undefined): SortMode {
  return value === "page" ? "page" : "relevance";
}

function filterGroups(groups: ArticleMatchGroup[], viewFilter: ViewFilter) {
  if (viewFilter === "matched") {
    return groups.filter((group) => group.matchType === "matched");
  }

  if (viewFilter === "only") {
    return groups.filter((group) => group.matchType !== "matched");
  }

  return groups;
}

function sortGroups(groups: ArticleMatchGroup[], sortMode: SortMode) {
  if (sortMode !== "page") {
    return groups;
  }

  return [...groups].sort(
    (left, right) =>
      groupPageNumber(left) - groupPageNumber(right) ||
      groupSourceRank(left) - groupSourceRank(right) ||
      right.confidence - left.confidence ||
      left.id.localeCompare(right.id),
  );
}

function groupPageNumber(group: ArticleMatchGroup) {
  const firstArticle = group.peopleArticles[0] ?? group.plaArticles[0];
  return firstArticle?.pageNumber ?? Number.MAX_SAFE_INTEGER;
}

function groupSourceRank(group: ArticleMatchGroup) {
  if (group.matchType === "matched") {
    return 0;
  }

  return group.matchType === "people_only" ? 1 : 2;
}

async function buildGraphDateMetrics(
  entries: SnapshotIndexEntry[],
  selectedIssueDate: string,
  selectedSnapshot?: DailyIssueSnapshot | null,
): Promise<IssueGraphDateMetric[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const archivedSnapshot =
        entry.issueDate === selectedIssueDate
          ? selectedSnapshot
          : await readDailyIssueSnapshot(entry.issueDate);

      if (!archivedSnapshot) {
        return {
          issueDate: entry.issueDate,
          nodes: entry.peopleArticles + entry.plaArticles,
          links: entry.matchedGroups,
          peopleNodes: entry.peopleArticles,
          plaNodes: entry.plaArticles,
          matchedNodes: entry.matchedPeopleArticles + entry.matchedPlaArticles,
          isolatedNodes: entry.peopleOnlyArticles + entry.plaOnlyArticles,
        };
      }

      const graph = buildIssueGraph(archivedSnapshot);

      return {
        issueDate: entry.issueDate,
        nodes: graph.counts.nodes,
        links: graph.counts.links,
        peopleNodes: graph.counts.peopleNodes,
        plaNodes: graph.counts.plaNodes,
        matchedNodes: graph.counts.matchedNodes,
        isolatedNodes: graph.counts.isolatedNodes,
      };
    }),
  );
}

function emptyCounts(): SnapshotCounts {
  return {
    matchedGroups: 0,
    matchedPeopleArticles: 0,
    matchedPlaArticles: 0,
    peopleArticles: 0,
    peopleOnlyArticles: 0,
    plaArticles: 0,
    plaOnlyArticles: 0,
  };
}

function SnapshotArchiveNotice({
  entries,
  selectedIssueDate,
  snapshotExists,
}: {
  entries: SnapshotIndexEntry[];
  selectedIssueDate: string;
  snapshotExists: boolean;
}) {
  const retainedDates = entries.map((entry) => entry.issueDate).sort();
  const oldestDate = retainedDates[0];
  const newestDate = retainedDates[retainedDates.length - 1];
  const retainedDateLabel =
    oldestDate && newestDate
      ? `${retainedDates.length}日分 (${formatIssueDate(oldestDate)}〜${formatIssueDate(newestDate)})`
      : "まだありません";

  return (
    <section className="mt-4 rounded-md border border-stone-200 bg-white px-4 py-3 text-xs leading-5 text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          保存済み: {retainedDateLabel}
        </p>
        <p>
          保存期間 {snapshotRetentionLabel()} / LLM更新{" "}
          {canUseLlmJudge() ? "有効" : "無効"}
        </p>
      </div>
      {!snapshotExists ? (
        <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300">
          {selectedIssueDate} はまだ生成されていません。公開ページは閲覧時にスクレイピングやLLM判定を実行しません。
        </p>
      ) : null}
    </section>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function formatIssueDate(value: string) {
  return value.replaceAll("-", ".");
}
