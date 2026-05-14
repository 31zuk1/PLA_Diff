import type { Source } from "@/types";

export type ArticleComparisonSource = Source;

export type IssueComparisonMatchType = "matched" | "people_only" | "pla_only";

export type ExtractionStatus =
  | "not_started"
  | "fetching"
  | "success"
  | "partial"
  | "empty"
  | "failed";

export interface ExtractionSummary {
  status: ExtractionStatus;
  method?: string;
  message?: string;
  extractedAt?: string;
}

export interface ScrapedArticle {
  id: string;
  source: ArticleComparisonSource;
  issueDate: string;
  pageNumber: number;
  pageName?: string;
  columnName?: string;
  title: string;
  subtitle?: string;
  author?: string;
  excerpt: string;
  keywords?: string[];
  url?: string;
  extraction?: ExtractionSummary;
}

export interface NewspaperPage {
  id?: string;
  source: ArticleComparisonSource;
  issueDate: string;
  pageNumber: number;
  pageName?: string;
  articles: ScrapedArticle[];
  pdfUrl?: string;
  pageImageUrl?: string;
  extraction?: ExtractionSummary;
}

export interface ArticleMatchGroup {
  id: string;
  issueDate: string;
  matchType: IssueComparisonMatchType;
  confidence: number;
  peopleArticles: ScrapedArticle[];
  plaArticles: ScrapedArticle[];
  reason: string;
  lexicalContrast?: {
    peopleDailyTerms: string[];
    plaDailyTerms: string[];
    sharedTerms?: string[];
  };
  extraction?: ExtractionSummary;
  uncertaintyNotes?: string[];
}

export interface NewspaperIssue {
  id: string;
  source: ArticleComparisonSource;
  issueDate: string;
  pages: NewspaperPage[];
  pdfUrl?: string;
  pageImageUrl?: string;
  extraction?: ExtractionSummary;
}
