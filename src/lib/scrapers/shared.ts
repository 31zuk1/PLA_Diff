import type { LayoutPoint, LayoutRegion } from "@/types";

export function toIssueDateParts(issueDate: string) {
  const match = issueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Expected issueDate as YYYY-MM-DD, received ${issueDate}`);
  }

  const [, year, month, day] = match;

  return {
    year,
    month,
    day,
    yearMonth: `${year}${month}`,
  };
}

export function pageId(source: string, issueDate: string, pageNumber: number) {
  return `${source}:${issueDate}:p${pageNumber.toString().padStart(2, "0")}`;
}

export function articleId(source: string, rawId: string) {
  return `${source}:${rawId}`;
}

export function resolveUrl(href: string, baseUrl: string) {
  return new URL(href, baseUrl).toString();
}

export function parseNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCoordinatePairs(values: string[]): LayoutPoint[] {
  const points: LayoutPoint[] = [];

  for (let index = 0; index < values.length - 1; index += 2) {
    const x = parseNumber(values[index]);
    const y = parseNumber(values[index + 1]);

    if (x !== undefined && y !== undefined) {
      points.push({ x, y });
    }
  }

  return points;
}

export function articleIdFromUrl(url: string) {
  const match = url.match(/content_(\d+)\.html/i);
  return match?.[1] ?? url;
}

export function withRegionArticleId(region: LayoutRegion, id: string): LayoutRegion {
  return {
    ...region,
    articleId: id,
  };
}
