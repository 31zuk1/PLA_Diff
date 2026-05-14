export type Source = "people_daily" | "pla_daily";

export type ExtractionStatus = "ok" | "partial" | "empty" | "failed";

export type LayoutRegionUnit = "px" | "percent";

export interface ExtractionInfo {
  status: ExtractionStatus;
  fetchedAt: string;
  sourceUrl: string;
  parser: string;
  timeoutMs: number;
  durationMs?: number;
  counts?: ExtractionCounts;
  errors: string[];
  warnings: string[];
}

export interface ExtractionCounts {
  requestedPages?: number;
  pages?: number;
  articles?: number;
  layoutRegions?: number;
  failedPages?: number;
  failedArticles?: number;
  emptyArticles?: number;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutRegion {
  articleId?: string;
  href?: string;
  unit: LayoutRegionUnit;
  shape: "polygon" | "rect" | "circle" | "unknown";
  points: LayoutPoint[];
}

export interface ScrapedArticle {
  id: string;
  source: Source;
  issueDate: string;
  pageNumber: number;
  pageName: string;
  title: string;
  subtitle?: string;
  author?: string;
  url: string;
  excerpt: string;
  /** Server-only matching text. Display adapters must not pass this to the client UI. */
  analysisText?: string;
  layoutRegion?: LayoutRegion;
  extractionInfo: ExtractionInfo;
}

export interface NewspaperPage {
  id: string;
  source: Source;
  issueDate: string;
  pageNumber: number;
  pageName: string;
  url: string;
  pdfUrl?: string;
  imageUrl?: string;
  layoutRegions: LayoutRegion[];
  articles: ScrapedArticle[];
  extractionInfo: ExtractionInfo;
}

export interface NewspaperIssue {
  id: string;
  source: Source;
  issueDate: string;
  pages: NewspaperPage[];
  extractionInfo: ExtractionInfo;
}

export interface ArticleMatchGroup {
  id: string;
  issueDate: string;
  peopleArticleIds: string[];
  plaArticleIds: string[];
  matchType: MatchType;
  confidence: number;
  evidence: EvidenceSnippet[];
  extractionInfo?: ExtractionInfo;
}

export type EntityType =
  | "person"
  | "org"
  | "place"
  | "policy"
  | "military_unit"
  | "slogan"
  | "other";

export interface Entity {
  text: string;
  type: EntityType;
  confidence: number;
}

export interface NarrativeProfile {
  coreFrame: string;
  mainActors: string[];
  beneficiaries: string[];
  problemTerms: string[];
  solutionTerms: string[];
  authoritySources: string[];
  actionVerbs: string[];
  tone?: string;
}

export interface Article {
  id: string;
  source: Source;
  issueDate: string;
  pageNumber: number;
  pageName: string;
  columnName?: string;
  title: string;
  subtitle?: string;
  author?: string;
  url: string;
  excerpt: string;
  keywords: string[];
  entities: Entity[];
  narrativeProfile: NarrativeProfile;
}

export type MatchType =
  | "same_event"
  | "same_policy"
  | "policy_to_military"
  | "same_slogan_different_case"
  | "one_sided"
  | "syndicated_or_reprint";

export interface TopicCluster {
  id: string;
  topicLabel: string;
  dateRange: {
    start: string;
    end: string;
  };
  matchType: MatchType;
  confidence: number;
  summary: string;
  peopleArticleIds: string[];
  plaArticleIds: string[];
  commonGround: string[];
  delta: NarrativeDelta;
  evidence: EvidenceSnippet[];
}

export type EvidenceClaimType =
  | "common_ground"
  | "frame_shift"
  | "actor_shift"
  | "goal_shift"
  | "threat_shift"
  | "solution_shift"
  | "authority_shift"
  | "lexical_contrast"
  | "silence_map";

export interface NarrativeDelta {
  frameShift: string;
  actorShift: string;
  goalShift: string;
  threatShift: string;
  solutionShift: string;
  authorityShift: string;
  lexicalContrast: {
    peopleDailyTerms: string[];
    plaDailyTerms: string[];
  };
  silenceMap: {
    peopleOnly: string[];
    plaOnly: string[];
  };
}

export interface EvidenceSnippet {
  source: Source;
  articleId: string;
  claimType: EvidenceClaimType;
  text: string;
  supports: string;
}
