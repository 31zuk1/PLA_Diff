import type {
  ArticleMatchGroup as DisplayArticleMatchGroup,
  ExtractionStatus as DisplayExtractionStatus,
  ExtractionSummary,
  IssueComparisonMatchType,
  NewspaperIssue as DisplayNewspaperIssue,
  NewspaperPage as DisplayNewspaperPage,
  ScrapedArticle as DisplayScrapedArticle,
} from "@/components/IssueComparisonTypes";
import {
  summarizeMatchReasons,
  type ArticleMatchGroup as RuleArticleMatchGroup,
  type MatchReasonSummary,
} from "@/lib/matching";
import type {
  ExtractionInfo,
  ExtractionStatus,
  NewspaperIssue,
  NewspaperPage,
  ScrapedArticle,
} from "@/types";

export function flattenIssueArticles(issue: NewspaperIssue) {
  return issue.pages.flatMap((page) => page.articles);
}

export function toDisplayIssue(issue: NewspaperIssue): DisplayNewspaperIssue {
  return {
    id: issue.id,
    source: issue.source,
    issueDate: issue.issueDate,
    pages: issue.pages.map(toDisplayPage),
    extraction: toDisplayExtraction(issue.extractionInfo),
  };
}

export function toDisplayMatchGroup(
  group: RuleArticleMatchGroup<ScrapedArticle>,
): DisplayArticleMatchGroup {
  const reasonSummary = summarizeMatchReasons(group, { includeScores: false });
  const matchType = toDisplayMatchType(group);
  const confidenceLabel = confidenceBandLabel(group.confidence);
  const isLlmMatched = group.reasons.some((reason) => reason.signal === "llm_adjudication");
  const isExactTitleMatched = group.reasons.some((reason) => reason.signal === "exact_title_match");
  const isStrongTitlePhraseMatched = group.reasons.some(
    (reason) => reason.signal === "strong_title_phrase_match",
  );
  const isTopicComponent = group.reasons.some(
    (reason) => reason.signal === "llm_topic_component" || reason.signal === "anchor_topic_component",
  );

  return {
    id: group.id,
    issueDate:
      group.peopleArticles[0]?.issueDate ?? group.plaArticles[0]?.issueDate ?? "unknown-date",
    matchType,
    confidence: group.confidence,
    peopleArticles: group.peopleArticles.map(toDisplayArticle),
    plaArticles: group.plaArticles.map(toDisplayArticle),
    reason: buildDisplayReason(group, reasonSummary, matchType, confidenceLabel),
    lexicalContrast: {
      peopleDailyTerms: group.peopleOnlyTerms,
      plaDailyTerms: group.plaOnlyTerms,
      sharedTerms: group.sharedTerms,
    },
    extraction: {
      status: "success",
      method:
        matchType === "matched"
          ? isTopicComponent
            ? "N-to-M match"
            : isExactTitleMatched
            ? "exact-title match"
            : isStrongTitlePhraseMatched
              ? "strong-title phrase match"
            : isLlmMatched
            ? "llm-adjudicated match"
            : "high-precision heuristic"
          : "not matched after adjudication",
      message: `${confidenceLabel} / lexical ${toPercent(group.lexicalSimilarity)} / narrative ${toPercent(
        group.narrativeSimilarity,
      )}`,
    },
    uncertaintyNotes: buildUncertaintyNotes(group, reasonSummary, matchType),
  };
}

function toDisplayMatchType(
  group: RuleArticleMatchGroup<ScrapedArticle>,
): IssueComparisonMatchType {
  if (group.matchType === "people_only" || group.matchType === "pla_only") {
    return group.matchType;
  }

  return "matched";
}

function buildDisplayReason(
  group: RuleArticleMatchGroup<ScrapedArticle>,
  reasonSummary: MatchReasonSummary,
  matchType: IssueComparisonMatchType,
  confidenceLabel: string,
): string {
  if (matchType === "people_only" || matchType === "pla_only") {
    const count = group.peopleArticles.length + group.plaArticles.length;
    const sourceLabel = matchType === "people_only" ? "People's only" : "81cn only";

    return `${sourceLabel} ${count}本。共通語候補をLLM/高精度ルールで確認した後、MATCHEDに採用されなかった記事です。`;
  }

  const sharedTerms = group.sharedTerms.slice(0, 4);
  const sharedText = sharedTerms.length ? `共有語: ${sharedTerms.join("、")}。` : "";
  const basis = reasonSummary.shortReasons.slice(0, 2).join(" / ");

  return `MACHED（${confidenceLabel}）。${sharedText}${basis || "共通語候補をLLM/高精度ルールで採用。"}`;
}

function buildUncertaintyNotes(
  group: RuleArticleMatchGroup<ScrapedArticle>,
  reasonSummary: MatchReasonSummary,
  matchType: IssueComparisonMatchType,
): string[] {
  const notes = [
    `語彙類似 ${toPercent(group.lexicalSimilarity)} / ナラティブ類似 ${toPercent(
      group.narrativeSimilarity,
    )}`,
  ];

  if (matchType === "matched") {
    notes.push("共通語候補をLLMまたは高精度ヒューリスティックで採否判定しています。");
    if (group.peopleArticles.length > 1 || group.plaArticles.length > 1) {
      notes.push("N対MのMATCHEDグループです。各記事が全記事と1対1対応するとは限りません。");
    }
  } else {
    notes.push("MATCHED採用されなかった記事を、記事単位でONLYとして表示しています。");
  }

  return [...notes, ...reasonSummary.shortReasons.slice(0, 2)];
}

function confidenceBandLabel(confidence: number): string {
  if (confidence >= 0.72) {
    return `高信頼 ${toPercent(confidence)}`;
  }

  if (confidence >= 0.48) {
    return `中信頼 ${toPercent(confidence)}`;
  }

  if (confidence > 0) {
    return `低信頼 ${toPercent(confidence)}`;
  }

  return "未照合";
}

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toDisplayPage(page: NewspaperPage): DisplayNewspaperPage {
  return {
    id: page.id,
    source: page.source,
    issueDate: page.issueDate,
    pageNumber: page.pageNumber,
    pageName: page.pageName,
    articles: page.articles.map(toDisplayArticle),
    pdfUrl: page.pdfUrl,
    pageImageUrl: page.imageUrl,
    extraction: toDisplayExtraction(page.extractionInfo),
  };
}

function toDisplayArticle(article: ScrapedArticle): DisplayScrapedArticle {
  return {
    id: article.id,
    source: article.source,
    issueDate: article.issueDate,
    pageNumber: article.pageNumber,
    pageName: article.pageName,
    title: article.title,
    subtitle: article.subtitle,
    author: article.author,
    excerpt: article.excerpt,
    url: article.url,
    extraction: toDisplayExtraction(article.extractionInfo),
  };
}

function toDisplayExtraction(info: ExtractionInfo): ExtractionSummary {
  const messages = [...info.errors, ...info.warnings].map(humanizeExtractionMessage);

  return {
    status: toDisplayStatus(info.status),
    method: info.parser,
    extractedAt: info.fetchedAt,
    message: Array.from(new Set(messages)).join(" / ") || undefined,
  };
}

function toDisplayStatus(status: ExtractionStatus): DisplayExtractionStatus {
  if (status === "ok") {
    return "success";
  }

  return status;
}

function humanizeExtractionMessage(message: string): string {
  if (message === "Article body text was empty") {
    return "一部記事は本文抽出不可。タイトル・版面・参照ボタンのみ表示しています。";
  }

  return message;
}
