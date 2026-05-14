import type { ExtractionCounts, ExtractionInfo, ExtractionStatus } from "@/types";

export interface FetchResult {
  ok: boolean;
  status?: number;
  url: string;
  durationMs: number;
  text?: string;
  error?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: HeadersInit;
}

const defaultHeaders: HeadersInit = {
  "User-Agent": "PeoplePLA-Diff/0.1 research metadata scraper",
};

export async function fetchTextWithTimeout(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url,
      durationMs: Date.now() - startedAt,
      text,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    return {
      ok: false,
      url,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createExtractionInfo(input: {
  status: ExtractionStatus;
  sourceUrl: string;
  parser: string;
  timeoutMs: number;
  durationMs?: number;
  counts?: ExtractionCounts;
  errors?: string[];
  warnings?: string[];
}): ExtractionInfo {
  return {
    status: input.status,
    fetchedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    parser: input.parser,
    timeoutMs: input.timeoutMs,
    durationMs: input.durationMs,
    counts: input.counts,
    errors: input.errors ?? [],
    warnings: input.warnings ?? [],
  };
}

export function toStatus(
  hasItems: boolean,
  errors: string[],
  warnings: string[] = [],
): ExtractionStatus {
  if (hasItems && (errors.length > 0 || warnings.length > 0)) {
    return "partial";
  }

  if (hasItems) {
    return "ok";
  }

  return errors.length > 0 ? "failed" : "empty";
}
