import type { LayoutRegion, NewspaperIssue, NewspaperPage, ScrapedArticle } from "@/types";
import { createExcerpt, extractParagraphText } from "@/lib/text";
import { createExtractionInfo, fetchTextWithTimeout, toStatus } from "./http";
import { articleId, pageId, parseCoordinatePairs, toIssueDateParts } from "./shared";

export interface PlaDailyScrapeOptions {
  pages?: number[];
  timeoutMs?: number;
  excerptChars?: number;
}

interface PlaDailyIndexJson {
  paperInfo?: PlaDailyPaperInfo[];
}

interface PlaDailyPaperInfo {
  paperBk?: unknown;
  paperData?: unknown;
  paperImg?: unknown;
  paperName?: unknown;
  paperNumber?: unknown;
  paperPDF?: unknown;
  webUrl?: unknown;
  xyList?: PlaDailyArticleJson[];
}

interface PlaDailyArticleJson {
  content?: unknown;
  id?: unknown;
  point?: unknown;
  title?: unknown;
  title2?: unknown;
  type?: unknown;
}

const parserName = "pla-daily-index-json-v1";

export async function fetchPlaDailyIssue(
  issueDate: string,
  options: PlaDailyScrapeOptions = {},
): Promise<NewspaperIssue> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const requestedPages = options.pages ?? [1, 2, 3, 4];
  const url = plaDailyIndexJsonUrl(issueDate);
  const response = await fetchTextWithTimeout(url, { timeoutMs });

  if (!response.ok || !response.text) {
    return emptyPlaDailyIssue(
      issueDate,
      url,
      timeoutMs,
      response.durationMs,
      requestedPages.length,
      [response.error ?? "Failed to fetch PLA Daily index JSON"],
    );
  }

  let parsed: PlaDailyIndexJson;

  try {
    parsed = JSON.parse(response.text) as PlaDailyIndexJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return emptyPlaDailyIssue(issueDate, url, timeoutMs, response.durationMs, requestedPages.length, [
      message,
    ]);
  }

  const wantedPages = new Set(requestedPages);
  const paperInfo = Array.isArray(parsed.paperInfo) ? parsed.paperInfo : [];
  const parsedPages = paperInfo
    .map((page) => parsePlaDailyPage(issueDate, page, options))
    .filter((page): page is NewspaperPage => Boolean(page))
    .filter((page) => wantedPages.has(page.pageNumber));
  const pages = materializeRequestedPlaPages(issueDate, options, parsedPages);
  const warnings = pages.flatMap((page) => page.extractionInfo.warnings);
  const articleCount = pages.reduce((total, page) => total + page.articles.length, 0);

  return {
    id: `pla_daily:${issueDate}`,
    source: "pla_daily",
    issueDate,
    pages,
    extractionInfo: createExtractionInfo({
      status: toStatus(articleCount > 0, [], warnings),
      sourceUrl: url,
      parser: parserName,
      timeoutMs,
      durationMs: response.durationMs,
      counts: {
        requestedPages: wantedPages.size,
        pages: pages.length,
        articles: articleCount,
        layoutRegions: pages.reduce((total, page) => total + page.layoutRegions.length, 0),
        emptyArticles: pages.reduce(
          (total, page) =>
            total +
            page.articles.filter((article) => article.extractionInfo.status === "empty").length,
          0,
        ),
      },
      warnings,
    }),
  };
}

export function plaDailyIndexJsonUrl(issueDate: string) {
  const { year, month, day } = toIssueDateParts(issueDate);
  return `https://www.81.cn/_szb/jfjb/${year}/${month}/${day}/index.json`;
}

function parsePlaDailyPage(
  issueDate: string,
  page: PlaDailyPaperInfo,
  options: PlaDailyScrapeOptions,
): NewspaperPage | undefined {
  const pageNumber = stringValue(page.paperNumber);

  if (!pageNumber) {
    return undefined;
  }

  const numericPage = Number.parseInt(pageNumber, 10);

  if (!Number.isFinite(numericPage)) {
    return undefined;
  }

  const pageName = stringValue(page.paperBk) || `第${pageNumber}版`;
  const url = stringValue(page.webUrl) || plaDailyPageWebUrl(issueDate, pageNumber);
  const xyList = Array.isArray(page.xyList) ? page.xyList : [];
  const articles = xyList
    .map((item, index) =>
      parsePlaDailyArticle(issueDate, numericPage, pageName, url, item, index, {
        excerptChars: options.excerptChars,
        timeoutMs: options.timeoutMs,
      }),
    )
    .filter((article): article is ScrapedArticle => Boolean(article));
  const layoutRegions = articles
    .map((article) => article.layoutRegion)
    .filter((region): region is LayoutRegion => Boolean(region));
  const articleWarnings = articles.flatMap((article) => article.extractionInfo.warnings);

  return {
    id: pageId("pla_daily", issueDate, numericPage),
    source: "pla_daily",
    issueDate,
    pageNumber: numericPage,
    pageName,
    url,
    pdfUrl: stringValue(page.paperPDF),
    imageUrl: stringValue(page.paperImg),
    layoutRegions,
    articles,
    extractionInfo: createExtractionInfo({
      status: toStatus(articles.length > 0, [], articleWarnings),
      sourceUrl: url,
      parser: parserName,
      timeoutMs: options.timeoutMs ?? 8_000,
      counts: {
        pages: 1,
        articles: articles.length,
        layoutRegions: layoutRegions.length,
        emptyArticles: articles.filter((article) => article.extractionInfo.status === "empty")
          .length,
      },
      warnings:
        articles.length === 0
          ? ["No articles found in PLA Daily page JSON", ...articleWarnings]
          : articleWarnings,
    }),
  };
}

function parsePlaDailyArticle(
  issueDate: string,
  pageNumber: number,
  pageName: string,
  pageUrl: string,
  article: PlaDailyArticleJson,
  index: number,
  options: Pick<PlaDailyScrapeOptions, "excerptChars" | "timeoutMs">,
): ScrapedArticle | undefined {
  const title = stringValue(article.title);
  const content = stringValue(article.content);

  if (!title && !content) {
    return undefined;
  }

  const rawId = stringValue(article.id) || `${issueDate}-${pageNumber}-${index}`;
  const id = articleId("pla_daily", rawId);
  const layoutRegion = parsePlaDailyRegion(article, id);
  const analysisText = extractParagraphText(content ?? "");
  const articleUrl = plaDailyArticleWebUrl(issueDate, pageNumber, rawId);

  return {
    id,
    source: "pla_daily",
    issueDate,
    pageNumber,
    pageName,
    title: title || "Untitled article",
    subtitle: stringValue(article.title2),
    url: articleUrl,
    excerpt: createExcerpt(analysisText, options.excerptChars),
    analysisText,
    layoutRegion,
    extractionInfo: createExtractionInfo({
      status: analysisText ? "ok" : "empty",
      sourceUrl: articleUrl,
      parser: parserName,
      timeoutMs: options.timeoutMs ?? 8_000,
      counts: {
        articles: 1,
        emptyArticles: analysisText ? 0 : 1,
      },
      warnings: analysisText ? [] : ["Article content text was empty"],
    }),
  };
}

function parsePlaDailyRegion(article: PlaDailyArticleJson, id?: string): LayoutRegion | undefined {
  const point = article.point;

  if (!Array.isArray(point)) {
    return undefined;
  }

  const points = parseCoordinatePairs(
    point.flatMap((value) => (typeof value === "string" ? value.split(",") : [])),
  );

  if (points.length === 0) {
    return undefined;
  }

  return {
    articleId: id,
    unit: "percent",
    shape: "polygon",
    points,
  };
}

function emptyPlaDailyIssue(
  issueDate: string,
  url: string,
  timeoutMs: number,
  durationMs: number | undefined,
  requestedPages: number,
  errors: string[],
): NewspaperIssue {
  return {
    id: `pla_daily:${issueDate}`,
    source: "pla_daily",
    issueDate,
    pages: [],
    extractionInfo: createExtractionInfo({
      status: "failed",
      sourceUrl: url,
      parser: parserName,
      timeoutMs,
      durationMs,
      counts: {
        requestedPages,
        pages: 0,
        articles: 0,
      },
      errors,
    }),
  };
}

function materializeRequestedPlaPages(
  issueDate: string,
  options: PlaDailyScrapeOptions,
  parsedPages: NewspaperPage[],
) {
  const requestedPages = options.pages ?? [1, 2, 3, 4];
  const pagesByNumber = new Map(parsedPages.map((page) => [page.pageNumber, page]));

  return requestedPages.map(
    (pageNumber) => pagesByNumber.get(pageNumber) ?? emptyPlaDailyPage(issueDate, pageNumber, options),
  );
}

function emptyPlaDailyPage(
  issueDate: string,
  pageNumber: number,
  options: PlaDailyScrapeOptions,
): NewspaperPage {
  const paperNumber = pageNumber.toString().padStart(2, "0");
  const url = plaDailyPageWebUrl(issueDate, paperNumber);

  return {
    id: pageId("pla_daily", issueDate, pageNumber),
    source: "pla_daily",
    issueDate,
    pageNumber,
    pageName: `第${paperNumber}版`,
    url,
    layoutRegions: [],
    articles: [],
    extractionInfo: createExtractionInfo({
      status: "empty",
      sourceUrl: url,
      parser: parserName,
      timeoutMs: options.timeoutMs ?? 8_000,
      counts: {
        pages: 1,
        articles: 0,
        layoutRegions: 0,
      },
      warnings: ["Requested PLA Daily page was not present in index JSON"],
    }),
  };
}

function plaDailyPageWebUrl(issueDate: string, paperNumber: string) {
  return `https://www.81.cn/szb_223187/szblb/index.html?paperNumber=${paperNumber}&paperName=jfjb&paperDate=${issueDate}`;
}

function plaDailyArticleWebUrl(issueDate: string, pageNumber: number, articleIdValue: string) {
  return `https://www.81.cn/szb_223187/szbxq/index.html?paperName=jfjb&paperDate=${issueDate}&paperNumber=${pageNumber
    .toString()
    .padStart(2, "0")}&articleid=${articleIdValue}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
