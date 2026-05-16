import type {
  ArticleMatchGroup,
  NewspaperIssue,
} from "@/components/IssueComparisonTypes";
import { flattenIssueArticles, toDisplayIssue, toDisplayMatchGroup } from "@/lib/issueComparison";
import { activeJudgeModelLabel, buildLlmJudgedMatchGroups, canUseLlmJudge } from "@/lib/llmMatching";
import { fetchPeopleDailyIssue, fetchPlaDailyIssue } from "@/lib/scrapers";
import {
  defaultSnapshotRetentionDays,
  frontPageNumbers,
  snapshotPathForDate,
  snapshotSchemaVersion,
} from "./snapshotConfig";

export interface DailyIssueSnapshot {
  schemaVersion: typeof snapshotSchemaVersion;
  issueDate: string;
  generatedAt: string;
  retentionDays: number;
  frontPages: number[];
  judge: {
    enabled: boolean;
    model: string;
  };
  peopleIssue: NewspaperIssue;
  plaIssue: NewspaperIssue;
  matchGroups: ArticleMatchGroup[];
  counts: SnapshotCounts;
}

export interface SnapshotCounts {
  peopleArticles: number;
  plaArticles: number;
  matchedGroups: number;
  matchedPeopleArticles: number;
  matchedPlaArticles: number;
  peopleOnlyArticles: number;
  plaOnlyArticles: number;
}

export interface SnapshotIndex {
  schemaVersion: typeof snapshotSchemaVersion;
  updatedAt: string;
  retentionDays: number;
  entries: SnapshotIndexEntry[];
}

export interface SnapshotIndexEntry extends SnapshotCounts {
  issueDate: string;
  generatedAt: string;
  judgeModel: string;
  judgeEnabled: boolean;
  status: "success" | "partial" | "failed";
  path: string;
}

export async function buildDailyIssueSnapshot(
  issueDate: string,
  options: {
    retentionDays?: number;
  } = {},
): Promise<DailyIssueSnapshot> {
  const [peopleIssue, plaIssue] = await Promise.all([
    fetchPeopleDailyIssue(issueDate, {
      excerptChars: 180,
      pages: [...frontPageNumbers],
      timeoutMs: 12_000,
    }),
    fetchPlaDailyIssue(issueDate, {
      excerptChars: 180,
      pages: [...frontPageNumbers],
      timeoutMs: 12_000,
    }),
  ]);
  const peopleArticles = flattenIssueArticles(peopleIssue);
  const plaArticles = flattenIssueArticles(plaIssue);
  const ruleGroups = await buildLlmJudgedMatchGroups(peopleArticles, plaArticles, {
    aggregateUnmatched: false,
    candidateLimit: 96,
    minCandidateConfidence: 0.1,
    minLlmConfidence: 70,
    useAi: canUseLlmJudge(),
  });
  const matchGroups = ruleGroups.map(toDisplayMatchGroup);

  return {
    schemaVersion: snapshotSchemaVersion,
    issueDate,
    generatedAt: new Date().toISOString(),
    retentionDays: options.retentionDays ?? defaultSnapshotRetentionDays,
    frontPages: [...frontPageNumbers],
    judge: {
      enabled: canUseLlmJudge(),
      model: activeJudgeModelLabel(),
    },
    peopleIssue: toDisplayIssue(peopleIssue),
    plaIssue: toDisplayIssue(plaIssue),
    matchGroups,
    counts: countSnapshotGroups(
      matchGroups,
      peopleArticles.length,
      plaArticles.length,
    ),
  };
}

export function emptySnapshotIndex(retentionDays = defaultSnapshotRetentionDays): SnapshotIndex {
  return {
    schemaVersion: snapshotSchemaVersion,
    updatedAt: new Date(0).toISOString(),
    retentionDays,
    entries: [],
  };
}

export function toSnapshotIndexEntry(snapshot: DailyIssueSnapshot): SnapshotIndexEntry {
  return {
    issueDate: snapshot.issueDate,
    generatedAt: snapshot.generatedAt,
    judgeEnabled: snapshot.judge.enabled,
    judgeModel: snapshot.judge.model,
    path: snapshotPathForDate(snapshot.issueDate),
    status: snapshotStatus(snapshot),
    ...snapshot.counts,
  };
}

function countSnapshotGroups(
  groups: ArticleMatchGroup[],
  peopleArticles: number,
  plaArticles: number,
): SnapshotCounts {
  const matchedGroups = groups.filter((group) => group.matchType === "matched");
  const peopleOnlyGroups = groups.filter((group) => group.matchType === "people_only");
  const plaOnlyGroups = groups.filter((group) => group.matchType === "pla_only");

  return {
    peopleArticles,
    plaArticles,
    matchedGroups: matchedGroups.length,
    matchedPeopleArticles: uniqueArticleCount(
      matchedGroups.flatMap((group) => group.peopleArticles),
    ),
    matchedPlaArticles: uniqueArticleCount(matchedGroups.flatMap((group) => group.plaArticles)),
    peopleOnlyArticles: uniqueArticleCount(
      peopleOnlyGroups.flatMap((group) => group.peopleArticles),
    ),
    plaOnlyArticles: uniqueArticleCount(plaOnlyGroups.flatMap((group) => group.plaArticles)),
  };
}

function uniqueArticleCount(articles: ArticleMatchGroup["peopleArticles"]) {
  return new Set(articles.map((article) => article.id)).size;
}

function snapshotStatus(snapshot: DailyIssueSnapshot): SnapshotIndexEntry["status"] {
  const statuses = [
    snapshot.peopleIssue.extraction?.status,
    snapshot.plaIssue.extraction?.status,
    ...snapshot.peopleIssue.pages.map((page) => page.extraction?.status),
    ...snapshot.plaIssue.pages.map((page) => page.extraction?.status),
  ];

  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.some((status) => status === "partial" || status === "empty")) {
    return "partial";
  }

  return "success";
}
