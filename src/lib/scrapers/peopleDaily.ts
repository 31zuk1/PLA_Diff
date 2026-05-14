import type { LayoutRegion, NewspaperIssue, NewspaperPage, ScrapedArticle } from "@/types";
import { createExcerpt, extractBetween, extractParagraphText, normalizeWhitespace, stripHtml } from "@/lib/text";
import { createExtractionInfo, fetchTextWithTimeout, toStatus } from "./http";
import {
  articleId,
  articleIdFromUrl,
  pageId,
  parseCoordinatePairs,
  resolveUrl,
  toIssueDateParts,
  withRegionArticleId,
} from "./shared";

export interface PeopleDailyScrapeOptions {
  pages?: number[];
  timeoutMs?: number;
  excerptChars?: number;
}

interface ArticleLink {
  title?: string;
  url: string;
  layoutRegion?: LayoutRegion;
}

const parserName = "people-daily-html-v1";

export async function fetchPeopleDailyIssue(
  issueDate: string,
  options: PeopleDailyScrapeOptions = {},
): Promise<NewspaperIssue> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const pages = options.pages ?? [1, 2, 3, 4];
  const issueUrl = peopleDailyLayoutUrl(issueDate, pages[0] ?? 1);
  const pageResults: NewspaperPage[] = [];

  for (const pageNumber of pages) {
    pageResults.push(await fetchPeopleDailyPage(issueDate, pageNumber, options));
  }

  const nonFailedPages = pageResults.filter((page) => page.extractionInfo.status !== "failed");
  const issuePages = nonFailedPages.length > 0 ? pageResults : [];
  const errors = pageResults.flatMap((page) => page.extractionInfo.errors);
  const warnings = pageResults.flatMap((page) => page.extractionInfo.warnings);
  const articleCount = issuePages.reduce((total, page) => total + page.articles.length, 0);
  const failedPageCount = pageResults.filter((page) => page.extractionInfo.status === "failed").length;
  const status = issueStatus({
    requestedPages: pages.length,
    returnedPages: issuePages.length,
    articleCount,
    failedPageCount,
    errors,
    warnings,
  });

  return {
    id: `people_daily:${issueDate}`,
    source: "people_daily",
    issueDate,
    pages: issuePages,
    extractionInfo: createExtractionInfo({
      status,
      sourceUrl: issueUrl,
      parser: parserName,
      timeoutMs,
      counts: {
        requestedPages: pages.length,
        pages: issuePages.length,
        articles: articleCount,
        layoutRegions: issuePages.reduce((total, page) => total + page.layoutRegions.length, 0),
        failedPages: failedPageCount,
        failedArticles: issuePages.reduce(
          (total, page) =>
            total +
            page.articles.filter((article) => article.extractionInfo.status === "failed").length,
          0,
        ),
        emptyArticles: issuePages.reduce(
          (total, page) =>
            total +
            page.articles.filter((article) => article.extractionInfo.status === "empty").length,
          0,
        ),
      },
      errors,
      warnings,
    }),
  };
}

export async function fetchPeopleDailyPage(
  issueDate: string,
  pageNumber: number,
  options: PeopleDailyScrapeOptions = {},
): Promise<NewspaperPage> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const url = peopleDailyLayoutUrl(issueDate, pageNumber);
  const response = await fetchTextWithTimeout(url, { timeoutMs });

  if (!response.ok || !response.text) {
    return emptyPeopleDailyPage(issueDate, pageNumber, url, timeoutMs, response.durationMs, [
      response.error ?? "Failed to fetch People's Daily layout page",
    ]);
  }

  const html = response.text;
  const pageName = extractPageName(html, pageNumber);
  const layoutRegions = extractLayoutRegions(html, url);
  const articleLinks = extractArticleLinks(html, url, layoutRegions);
  const articles = await Promise.all(
    articleLinks.map((link) =>
      fetchPeopleDailyArticle(issueDate, pageNumber, pageName, link, {
        timeoutMs,
        excerptChars: options.excerptChars,
      }),
    ),
  );
  const articleErrors = articles.flatMap((article) => article.extractionInfo.errors);
  const articleWarnings = articles.flatMap((article) => article.extractionInfo.warnings);

  return {
    id: pageId("people_daily", issueDate, pageNumber),
    source: "people_daily",
    issueDate,
    pageNumber,
    pageName,
    url,
    pdfUrl: extractFirstResolvedHref(html, url, /\.pdf(?:["?#]|$)/i),
    imageUrl: extractPageImageUrl(html, url),
    layoutRegions,
    articles,
    extractionInfo: createExtractionInfo({
      status: toStatus(articles.length > 0, articleErrors, articleWarnings),
      sourceUrl: url,
      parser: parserName,
      timeoutMs,
      durationMs: response.durationMs,
      counts: {
        pages: 1,
        articles: articles.length,
        layoutRegions: layoutRegions.length,
        failedArticles: articles.filter((article) => article.extractionInfo.status === "failed")
          .length,
        emptyArticles: articles.filter((article) => article.extractionInfo.status === "empty")
          .length,
      },
      errors: articleErrors,
      warnings:
        articleLinks.length === 0
          ? ["No article links found on layout page", ...articleWarnings]
          : articleWarnings,
    }),
  };
}

export async function fetchPeopleDailyArticle(
  issueDate: string,
  pageNumber: number,
  pageName: string,
  link: ArticleLink,
  options: Pick<PeopleDailyScrapeOptions, "excerptChars" | "timeoutMs"> = {},
): Promise<ScrapedArticle> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const response = await fetchTextWithTimeout(link.url, { timeoutMs });
  const rawId = articleIdFromUrl(link.url);
  const id = articleId("people_daily", rawId);

  if (!response.ok || !response.text) {
    return {
      id,
      source: "people_daily",
      issueDate,
      pageNumber,
      pageName,
      title: link.title ?? "Untitled article",
      url: link.url,
      excerpt: "",
      layoutRegion: link.layoutRegion ? withRegionArticleId(link.layoutRegion, id) : undefined,
      extractionInfo: createExtractionInfo({
        status: "failed",
        sourceUrl: link.url,
        parser: parserName,
        timeoutMs,
        durationMs: response.durationMs,
        counts: {
          articles: 1,
          failedArticles: 1,
        },
        errors: [response.error ?? "Failed to fetch People's Daily article"],
      }),
    };
  }

  const parsed = parsePeopleDailyArticleHtml(response.text, link.title);
  const analysisText = parsed.text;

  return {
    id,
    source: "people_daily",
    issueDate,
    pageNumber,
    pageName,
    title: parsed.title,
    subtitle: parsed.subtitle,
    author: parsed.author,
    url: link.url,
    excerpt: createExcerpt(analysisText, options.excerptChars),
    analysisText,
    layoutRegion: link.layoutRegion ? withRegionArticleId(link.layoutRegion, id) : undefined,
    extractionInfo: createExtractionInfo({
      status: analysisText ? "ok" : "empty",
      sourceUrl: link.url,
      parser: parserName,
      timeoutMs,
      durationMs: response.durationMs,
      counts: {
        articles: 1,
        emptyArticles: analysisText ? 0 : 1,
      },
      warnings: analysisText ? [] : ["Article body text was empty"],
    }),
  };
}

export function peopleDailyLayoutUrl(issueDate: string, pageNumber: number) {
  const { yearMonth, day } = toIssueDateParts(issueDate);
  return `https://paper.people.com.cn/rmrb/pc/layout/${yearMonth}/${day}/node_${pageNumber
    .toString()
    .padStart(2, "0")}.html`;
}

function emptyPeopleDailyPage(
  issueDate: string,
  pageNumber: number,
  url: string,
  timeoutMs: number,
  durationMs: number | undefined,
  errors: string[],
): NewspaperPage {
  return {
    id: pageId("people_daily", issueDate, pageNumber),
    source: "people_daily",
    issueDate,
    pageNumber,
    pageName: `第${pageNumber.toString().padStart(2, "0")}版`,
    url,
    layoutRegions: [],
    articles: [],
    extractionInfo: createExtractionInfo({
      status: "failed",
      sourceUrl: url,
      parser: parserName,
      timeoutMs,
      durationMs,
      counts: {
        pages: 1,
        articles: 0,
        layoutRegions: 0,
        failedPages: 1,
      },
      errors,
    }),
  };
}

function issueStatus(input: {
  requestedPages: number;
  returnedPages: number;
  articleCount: number;
  failedPageCount: number;
  errors: string[];
  warnings: string[];
}) {
  if (input.requestedPages === 0) {
    return "empty";
  }

  if (input.returnedPages === 0 && input.failedPageCount > 0) {
    return "failed";
  }

  if (input.articleCount === 0) {
    return input.errors.length > 0 ? "failed" : "empty";
  }

  if (input.failedPageCount > 0 || input.errors.length > 0 || input.warnings.length > 0) {
    return "partial";
  }

  return "ok";
}

function parsePeopleDailyArticleHtml(html: string, fallbackTitle?: string) {
  const enpContent = extractBetween(html, "<!--enpcontent-->", "<!--/enpcontent-->");
  const zoomContent = extractTagById(html, "ozoom");
  const articleContent = enpContent ?? zoomContent ?? extractTagById(html, "articleContent") ?? "";
  const title =
    extractTagText(html, "h1") ??
    extractEnpProperty(html, "title") ??
    extractDocumentTitle(html) ??
    fallbackTitle ??
    "Untitled article";

  return {
    title,
    subtitle: extractTagText(html, "h2") ?? extractEnpProperty(html, "subtitle"),
    author: extractEnpProperty(html, "author"),
    text: extractParagraphText(articleContent),
  };
}

function extractPageName(html: string, pageNumber: number) {
  const matches = Array.from(html.matchAll(/第\s*0?(\d{1,2})\s*版[：:]\s*([^<\n\r]+)/g));
  const pageMatch = matches.find((match) => Number.parseInt(match[1] ?? "", 10) === pageNumber);
  const name = normalizeWhitespace(pageMatch?.[2] ?? "");

  return name || `第${pageNumber.toString().padStart(2, "0")}版`;
}

function extractLayoutRegions(html: string, baseUrl: string): LayoutRegion[] {
  const regions: LayoutRegion[] = [];

  for (const match of html.matchAll(/<area\b([^>]+)>/gi)) {
    const attrs = match[1] ?? "";
    const href = extractAttribute(attrs, "href");
    const coords = extractAttribute(attrs, "coords");

    if (!href || !coords) {
      continue;
    }

    const shape = extractAttribute(attrs, "shape")?.toLowerCase();

    regions.push({
      href: resolveUrl(href, baseUrl),
      unit: "px",
      shape: shape === "polygon" || shape === "rect" || shape === "circle" ? shape : "unknown",
      points: parseCoordinatePairs(coords.split(",").map((value) => value.trim())),
    });
  }

  return regions;
}

function extractArticleLinks(html: string, baseUrl: string, regions: LayoutRegion[]): ArticleLink[] {
  const regionLinks = regions
    .filter((region): region is LayoutRegion & { href: string } => Boolean(region.href))
    .map((region) => ({
      url: region.href,
      layoutRegion: region,
    }));
  const newsList = extractTagByClass(html, "ul", "news-list") ?? "";
  const titledLinks: ArticleLink[] = [];

  for (const match of newsList.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi)) {
    const href = extractAttribute(match[1] ?? "", "href");

    if (!href) {
      continue;
    }

    titledLinks.push({
      title: stripHtml(match[2] ?? ""),
      url: resolveUrl(href, baseUrl),
    });
  }

  const linksByUrl = new Map<string, ArticleLink>();

  for (const link of regionLinks) {
    linksByUrl.set(link.url, link);
  }

  for (const link of titledLinks) {
    const existing = linksByUrl.get(link.url);
    linksByUrl.set(link.url, {
      ...existing,
      ...link,
      layoutRegion: existing?.layoutRegion,
    });
  }

  return Array.from(linksByUrl.values()).filter((link) => !isEditorialCreditTitle(link.title));
}

function extractPageImageUrl(html: string, baseUrl: string) {
  const match = html.match(/<img\b[^>]*\busemap\s*=\s*["']?#PagePicMap["']?[^>]*>/i);
  const src = match ? extractAttribute(match[0], "src") : undefined;
  return src ? resolveUrl(src, baseUrl) : undefined;
}

function extractFirstResolvedHref(html: string, baseUrl: string, pattern: RegExp) {
  const match = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).find((item) =>
    pattern.test(item[1] ?? ""),
  );
  const href = match?.[1];
  return href ? resolveUrl(href, baseUrl) : undefined;
}

function extractDocumentTitle(html: string) {
  return extractTagText(html, "title");
}

function extractEnpProperty(html: string, property: string) {
  const match = html.match(new RegExp(`<${property}>([\\s\\S]*?)<\\/${property}>`, "i"));
  const value = match?.[1] ? stripHtml(match[1]) : undefined;
  return value || undefined;
}

function extractTagText(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  const value = match?.[1] ? stripHtml(match[1]) : undefined;
  return value || undefined;
}

function extractTagById(html: string, id: string) {
  const match = html.match(
    new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i"),
  );
  return match?.[2];
}

function extractTagByClass(html: string, tagName: string, className: string) {
  const match = html.match(
    new RegExp(
      `<${tagName}\\b[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      "i",
    ),
  );
  return match?.[1];
}

function extractAttribute(htmlOrAttrs: string, name: string) {
  const match = htmlOrAttrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2];
}

function isEditorialCreditTitle(title: string | undefined) {
  if (!title) {
    return false;
  }

  return /(?:^|[一二三四五六七八九十0-9])版责编[：:]/.test(normalizeWhitespace(title));
}
